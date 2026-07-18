/**
 * HiggsfieldClient — ÚNICA pieza que habla con la API de Higgsfield.
 *
 * Contrato REAL del SDK oficial @higgsfield/client v0.2.1 (verificado):
 *   Base URL: https://platform.higgsfield.ai
 *   Auth:     headers  hf-api-key: <KEY_ID>   hf-secret: <KEY_SECRET>
 *   Generar:  POST /v1/<endpoint>  body { params, webhook?:{url,secret} }
 *   Poll:     GET  /v1/job-sets/{id}
 *   Upload:   POST /files/generate-upload-url {content_type} → {upload_url, public_url}, luego PUT
 *   Estilos:  GET  /v1/text2image/soul-styles   (Soul)
 *   Motions:  GET  /v1/motions                  (DoP / cinema)
 *   Soul-ID:  GET  /v1/custom-references/list
 *
 * La API key del lado servidor NUNCA se expone al cliente.
 */

import axios, { AxiosInstance } from "axios";
import fs from "fs";
import logger from "../../../utils/logger";
import { resolveHiggsfieldConfig } from "./HiggsfieldConfig";
import { HiggsfieldAuthError, normalizeHiggsfieldError } from "./errors";
import type {
  HiggsfieldJobSet,
  HiggsfieldSoulStyle,
  HiggsfieldMotion,
  HiggsfieldCustomReference,
  HiggsfieldUploadLink
} from "./types";

const ENDPOINTS = {
  jobSet: (id: string) => `/v1/job-sets/${encodeURIComponent(id)}`,
  uploadUrl: "/files/generate-upload-url",
  soulStyles: "/v1/text2image/soul-styles",
  motions: "/v1/motions",
  customReferences: "/v1/custom-references/list"
} as const;

const DEFAULT_TIMEOUT_MS = 120_000;

export interface HiggsfieldWebhookRef {
  url: string;
  secret?: string;
}

export class HiggsfieldClient {
  private companyId?: number | null;

  constructor(companyId?: number | null) {
    this.companyId = companyId;
  }

  /** axios autenticado con la config resuelta (hf-api-key / hf-secret). */
  private async http(): Promise<AxiosInstance> {
    const config = await resolveHiggsfieldConfig(this.companyId);
    if (!config?.apiKey || !config?.apiSecret) {
      throw new HiggsfieldAuthError(
        "Higgsfield credentials (key/secret) no configuradas para la company"
      );
    }
    return axios.create({
      baseURL: config.baseUrl,
      timeout: DEFAULT_TIMEOUT_MS,
      headers: {
        "hf-api-key": config.apiKey,
        "hf-secret": config.apiSecret,
        "Content-Type": "application/json"
      }
    });
  }

  // ---- generate / poll ---------------------------------------------------

  /**
   * Lanza una generación. `endpoint` es el job_set_type (p.ej.
   * "/v1/image2video/dop"). Devuelve el JobSet inicial (con id).
   */
  async generate(
    endpoint: string,
    params: Record<string, unknown>,
    webhook?: HiggsfieldWebhookRef
  ): Promise<HiggsfieldJobSet> {
    try {
      const http = await this.http();
      const body: Record<string, unknown> = { params };
      if (webhook?.url) body.webhook = webhook;
      const { data } = await http.post(endpoint, body);
      const jobSet = (data?.data ?? data) as HiggsfieldJobSet;
      if (!jobSet?.id) {
        throw new Error("Higgsfield generate no devolvió job-set id");
      }
      return jobSet;
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  /** Consulta el estado de un job-set. */
  async getJobSet(id: string): Promise<HiggsfieldJobSet> {
    try {
      const http = await this.http();
      const { data } = await http.get(ENDPOINTS.jobSet(id));
      return (data?.data ?? data) as HiggsfieldJobSet;
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  // ---- estilos / motions (fuente real de presets) -----------------------

  async getSoulStyles(): Promise<HiggsfieldSoulStyle[]> {
    try {
      const http = await this.http();
      const { data } = await http.get(ENDPOINTS.soulStyles);
      const list = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return list as HiggsfieldSoulStyle[];
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  async getMotions(): Promise<HiggsfieldMotion[]> {
    try {
      const http = await this.http();
      const { data } = await http.get(ENDPOINTS.motions);
      const list = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return list as HiggsfieldMotion[];
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  // ---- upload (referencias "+") -----------------------------------------

  /**
   * Sube media a la CDN de Higgsfield: pide un upload-url firmado y hace PUT.
   * Devuelve el `public_url` (que se usa como image_url/audio_url en inputs).
   */
  async upload(input: {
    filePath?: string;
    buffer?: Buffer;
    contentType: string;
  }): Promise<HiggsfieldUploadLink> {
    try {
      const http = await this.http();
      const { data } = await http.post(ENDPOINTS.uploadUrl, {
        content_type: input.contentType
      });
      const link = (data?.data ?? data) as HiggsfieldUploadLink;
      if (!link?.upload_url || !link?.public_url) {
        throw new Error("Higgsfield generate-upload-url respuesta inválida");
      }

      const payload = input.buffer
        ? input.buffer
        : input.filePath
        ? fs.readFileSync(input.filePath)
        : null;
      if (!payload) throw new Error("upload requiere filePath o buffer");

      await axios.put(link.upload_url, payload, {
        timeout: DEFAULT_TIMEOUT_MS,
        headers: { "Content-Type": input.contentType },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      return link;
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  // ---- soul-id (custom references / personajes) -------------------------

  async listCustomReferences(
    page = 1,
    pageSize = 20
  ): Promise<HiggsfieldCustomReference[]> {
    try {
      const http = await this.http();
      const { data } = await http.get(ENDPOINTS.customReferences, {
        params: { page, page_size: pageSize }
      });
      const list = Array.isArray(data) ? data : data?.items ?? data?.data ?? [];
      return list as HiggsfieldCustomReference[];
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  /**
   * Sondeo de validación SIN crear job ni cobrar: envía `params` al endpoint
   * con `prompt` forzado a vacío (siempre inválido → 422/400). Devuelve el
   * status + el cuerpo de la respuesta para ver cómo el servidor parsea los
   * campos. Nunca genera ni descuenta créditos.
   */
  async validateProbe(
    endpoint: string,
    params: Record<string, unknown>
  ): Promise<{ status: number; data: unknown }> {
    try {
      const http = await this.http();
      // Forzar inválido: prompt vacío. Si el endpoint no requiere prompt,
      // añadimos un campo basura para garantizar el rechazo.
      const probeParams = { ...params, prompt: "", __debug_invalid__: true };
      const resp = await http.post(
        endpoint,
        { params: probeParams },
        { validateStatus: () => true } // no lanzar; queremos ver el 4xx
      );
      return { status: resp.status, data: resp.data };
    } catch (err) {
      throw normalizeHiggsfieldError(err);
    }
  }

  /** Diagnóstico ligero: intenta listar motions (endpoint barato autenticado). */
  async ping(): Promise<boolean> {
    try {
      await this.getMotions();
      return true;
    } catch (err) {
      logger.warn(`[HiggsfieldClient] ping falló: ${String(err)}`);
      return false;
    }
  }
}

export default HiggsfieldClient;
