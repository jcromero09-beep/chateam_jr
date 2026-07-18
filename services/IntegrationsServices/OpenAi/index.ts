// Re-exporta handleOpenAi para mantener compatibilidad con imports existentes
// Uso: import { handleOpenAi } from "../IntegrationsServices/OpenAi/index"
export { handleOpenAi } from "./handleOpenAi";

// Re-exportar tipos por si se necesitan en otros modulos
export type { IOpenAi, Session, QueueClassificationResult } from "./types";
