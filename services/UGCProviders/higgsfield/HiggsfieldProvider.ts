/**
 * HiggsfieldProvider — implementación del contrato neutro GenerationProvider
 * para Higgsfield, alineada al SDK oficial.
 *
 * Lecturas (listModels/getModel) usan el catálogo estático y, cuando hay
 * credenciales, ENRIQUECEN los estilos con los reales del proveedor:
 *   • Soul → GET /v1/text2image/soul-styles
 *   • DoP  → GET /v1/motions  (movimientos de cámara cinematográficos)
 *
 * Las mutaciones (createJob/uploadMedia) requieren credenciales y NO hacen
 * fallback silencioso.
 */

import logger from "../../../utils/logger";
import type {
  GenerationProvider,
  ListModelsOptions,
  UploadMediaInput
} from "../../Generation/GenerationProvider";
import type {
  NormalizedModel,
  NormalizedModelDetail,
  GenerationRequest,
  ProviderJob,
  CharacterRef,
  UploadResult,
  ProviderId
} from "../../Generation/types";
import HiggsfieldClient from "./HiggsfieldClient";
import { getCatalogModels, getCatalogModel, estimateCatalogCostUsd } from "./catalog";
import {
  mapJobSet,
  mapSoulStyle,
  mapMotion,
  mapCharacter,
  buildGeneratePayload
} from "./mapper";
import { HiggsfieldProviderError } from "./errors";
import { resolveHiggsfieldConfig } from "./HiggsfieldConfig";
import { getModelDef } from "./models";

export class HiggsfieldProvider implements GenerationProvider {
  readonly id: ProviderId = "higgsfield";

  private client(companyId?: number | null): HiggsfieldClient {
    return new HiggsfieldClient(companyId);
  }

  private async hasCredentials(companyId?: number | null): Promise<boolean> {
    const config = await resolveHiggsfieldConfig(companyId);
    return Boolean(config?.apiKey && config?.apiSecret);
  }

  async listModels(options?: ListModelsOptions): Promise<NormalizedModel[]> {
    let models = getCatalogModels();
    if (options?.mediaType) {
      models = models.filter(m => m.mediaType === options.mediaType);
    }

    // Enriquecer la tarjeta de Soul/DoP con un ejemplo REAL (primer
    // soul-style / motion con preview). Los demás modelos no exponen ejemplo.
    if (await this.hasCredentials(options?.companyId)) {
      try {
        const client = this.client(options?.companyId);
        const needSoul = models.some(m => getModelDef(m.id)?.stylesSource === "soul-styles");
        const needDop = models.some(m => getModelDef(m.id)?.stylesSource === "motions");
        const [styles, motions] = await Promise.all([
          needSoul ? client.getSoulStyles().catch(() => []) : Promise.resolve([]),
          needDop ? client.getMotions().catch(() => []) : Promise.resolve([])
        ]);
        const soulPreview = styles.find(s => s.preview_url)?.preview_url;
        const dopPreview = motions.find(m => m.preview_url)?.preview_url;
        models = models.map(m => {
          const src = getModelDef(m.id)?.stylesSource;
          if (src === "soul-styles" && soulPreview) {
            return { ...m, previews: [{ thumbnailUrl: soulPreview, exampleUrl: soulPreview, mediaType: "image" }] };
          }
          if (src === "motions" && dopPreview) {
            return { ...m, previews: [{ thumbnailUrl: dopPreview, exampleUrl: dopPreview, mediaType: "video" }] };
          }
          return m;
        });
      } catch (err) {
        logger.warn(`[HiggsfieldProvider] no se pudieron enriquecer previews: ${String(err)}`);
      }
    }

    // Devolver shape NormalizedModel (sin params) — el front no los necesita aquí.
    return models.map(({ params, ...rest }) => rest);
  }

  async getModel(
    modelId: string,
    options?: ListModelsOptions
  ): Promise<NormalizedModelDetail> {
    const base = getCatalogModel(modelId);
    if (!base) {
      throw new HiggsfieldProviderError(
        `Modelo no encontrado: ${modelId}`,
        "validation",
        404
      );
    }

    // Enriquecer estilos + preview con los reales del proveedor (si hay creds).
    const src = getModelDef(modelId)?.stylesSource;
    if (src && (await this.hasCredentials(options?.companyId))) {
      try {
        if (src === "soul-styles") {
          const styles = await this.client(options?.companyId).getSoulStyles();
          if (styles.length) {
            const preview = styles.find(s => s.preview_url)?.preview_url;
            return {
              ...base,
              styles: styles.map(mapSoulStyle),
              previews: preview
                ? [{ thumbnailUrl: preview, exampleUrl: preview, mediaType: "image" }]
                : base.previews
            };
          }
        } else if (src === "motions") {
          const motions = await this.client(options?.companyId).getMotions();
          if (motions.length) {
            const preview = motions.find(m => m.preview_url)?.preview_url;
            return {
              ...base,
              styles: motions.map(mapMotion),
              previews: preview
                ? [{ thumbnailUrl: preview, exampleUrl: preview, mediaType: "video" }]
                : base.previews
            };
          }
        }
      } catch (err) {
        logger.warn(
          `[HiggsfieldProvider] no se pudieron cargar estilos reales (${modelId}): ${String(err)}`
        );
      }
    }
    return base;
  }

  async estimateProviderCostUsd(req: GenerationRequest): Promise<number> {
    // El SDK no expone endpoint de costo: estimación por catálogo.
    return estimateCatalogCostUsd({
      modelId: req.modelId,
      duration: req.duration,
      count: req.count
    });
  }

  async createJob(
    req: GenerationRequest,
    options?: { webhookUrl?: string }
  ): Promise<ProviderJob> {
    const config = await resolveHiggsfieldConfig(req.tenantId);
    if (!config?.apiKey || !config?.apiSecret) {
      throw new HiggsfieldProviderError(
        "Higgsfield no está configurado (faltan key/secret) — no se puede generar",
        "auth",
        503
      );
    }

    const { endpoint, params } = buildGeneratePayload(req);
    const webhook = options?.webhookUrl
      ? { url: options.webhookUrl, secret: config.webhookSecret || undefined }
      : undefined;

    const jobSet = await this.client(req.tenantId).generate(endpoint, params, webhook);
    const mapped = mapJobSet(jobSet);
    return {
      providerJobId: jobSet.id,
      status: mapped.status === "succeeded" ? "succeeded" : "queued",
      outputs: mapped.outputs,
      raw: jobSet
    };
  }

  async getJob(providerJobId: string, companyId: number): Promise<ProviderJob> {
    const jobSet = await this.client(companyId).getJobSet(providerJobId);
    return mapJobSet(jobSet);
  }

  async uploadMedia(input: UploadMediaInput): Promise<UploadResult> {
    if (!(await this.hasCredentials(input.companyId))) {
      throw new HiggsfieldProviderError(
        "Higgsfield no está configurado (faltan key/secret) — no se puede subir media",
        "auth",
        503
      );
    }
    const link = await this.client(input.companyId).upload({
      filePath: input.filePath,
      buffer: input.buffer,
      contentType: input.mimeType
    });
    // El id usable como referencia es la URL pública (image_url/audio_url).
    return { id: link.public_url, url: link.public_url };
  }

  async listCharacters(companyId: number): Promise<CharacterRef[]> {
    if (!(await this.hasCredentials(companyId))) return [];
    try {
      const refs = await this.client(companyId).listCustomReferences();
      return refs.map(mapCharacter);
    } catch (err) {
      logger.warn(`[HiggsfieldProvider] listCharacters falló: ${String(err)}`);
      return [];
    }
  }

  resolveCreditTypeKey(req: GenerationRequest): string {
    return req.mediaType === "image" ? "image" : "ugc_video";
  }

  // ---- DEBUG (sin crear job ni cobrar) ----------------------------------

  debugBuild(req: GenerationRequest): {
    endpoint: string;
    params: Record<string, unknown>;
  } {
    return buildGeneratePayload(req);
  }

  async debugValidate(req: GenerationRequest): Promise<{
    endpoint: string;
    sentParams: Record<string, unknown>;
    status: number;
    data: unknown;
  }> {
    const { endpoint, params } = buildGeneratePayload(req);
    const probe = await this.client(req.tenantId).validateProbe(endpoint, params);
    return { endpoint, sentParams: params, status: probe.status, data: probe.data };
  }
}

export default HiggsfieldProvider;
