/**
 * Contrato NEUTRO que todo proveedor de generación de imagen/video debe
 * implementar (spec §1). Permite que el orquestador y los controllers HTTP
 * trabajen sin saber del proveedor concreto.
 *
 * Implementaciones actuales:
 *   - HiggsfieldProvider (services/UGCProviders/higgsfield/HiggsfieldProvider.ts)
 *
 * fal.ai NO implementa esta interfaz por ahora (se deja intacto). Puede
 * envolverse luego sin tocar el resto gracias al ProviderRegistry.
 */

import type {
  NormalizedModel,
  NormalizedModelDetail,
  GenerationRequest,
  CostEstimate,
  ProviderJob,
  CharacterRef,
  UploadResult,
  MediaType,
  ProviderId
} from "./types";

export interface ListModelsOptions {
  /** Filtra por tipo de media. */
  mediaType?: MediaType;
  /** companyId para resolver credenciales/catálogo por tenant. */
  companyId?: number | null;
}

export interface UploadMediaInput {
  companyId: number;
  /** Ruta local del archivo subido (multer) o buffer. */
  filePath?: string;
  buffer?: Buffer;
  fileName: string;
  mimeType: string;
}

export interface GenerationProvider {
  /** Identificador estable del proveedor. */
  readonly id: ProviderId;

  /** Lista los modelos normalizados (con previews + estilos). */
  listModels(options?: ListModelsOptions): Promise<NormalizedModel[]>;

  /** Detalle de un modelo (schema de params + defaults + límites + estilos). */
  getModel(
    modelId: string,
    options?: ListModelsOptions
  ): Promise<NormalizedModelDetail>;

  /**
   * Estima el costo CRUDO en USD del proveedor para una solicitud. La capa
   * neutral (EstimateCostService) aplica el markup y la conversión a créditos.
   */
  estimateProviderCostUsd(req: GenerationRequest): Promise<number>;

  /** Crea un job asíncrono en el proveedor y devuelve su id + estado inicial. */
  createJob(
    req: GenerationRequest,
    options?: { webhookUrl?: string }
  ): Promise<ProviderJob>;

  /** Consulta el estado + outputs de un job del proveedor. */
  getJob(providerJobId: string, companyId: number): Promise<ProviderJob>;

  /** Sube media de referencia (botón "+") y devuelve su id en el proveedor. */
  uploadMedia(input: UploadMediaInput): Promise<UploadResult>;

  /** (Opcional) Lista referencias de personaje reutilizables (soul-id "@"). */
  listCharacters?(companyId: number): Promise<CharacterRef[]>;

  /**
   * (Opcional) Convención de costo→créditos específica. Si no se implementa,
   * la capa neutral usa generationCostToCompanyTokens con el creditTypeKey
   * derivado del mediaType.
   */
  resolveCreditTypeKey?(req: GenerationRequest): string;

  /**
   * (Opcional, DEBUG) Construye el payload EXACTO que se enviaría al proveedor
   * sin llamar a la API ni cobrar. Para inspeccionar qué se manda.
   */
  debugBuild?(req: GenerationRequest): {
    endpoint: string;
    params: Record<string, unknown>;
  };

  /**
   * (Opcional, DEBUG) Envía una validación al proveedor con un campo forzado
   * inválido → NO crea job ni cobra; devuelve cómo el servidor recibe/parsea
   * los campos.
   */
  debugValidate?(req: GenerationRequest): Promise<{
    endpoint: string;
    sentParams: Record<string, unknown>;
    status: number;
    data: unknown;
  }>;
}

/** Helper opcional para estimar CostEstimate; lo usa el orquestador. */
export type { CostEstimate };
