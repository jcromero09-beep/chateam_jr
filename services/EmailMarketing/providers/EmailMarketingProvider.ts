import logger from "../../../utils/logger";
import {
  BaseEmailProvider,
  EmailMessage,
  SendEmailResponse
} from "./BaseEmailProvider";

/**
 * EmailMarketingProvider — interfaz extendida para Email Marketing completo.
 *
 * Define todas las operaciones que un proveedor de Email Marketing debe
 * soportar: gestion de listas, suscriptores, plantillas, campanas y envios
 * transaccionales/de prueba.
 *
 * Solo implementan esta interfaz los providers `acelle` y `listmonk`.
 * Los providers transaccionales puros (sendgrid, mailgun, ses, carbonio)
 * solo implementan `BaseEmailProvider` y NO aparecen en el modulo de
 * Email Marketing.
 *
 * Diseno:
 *   - Clase abstracta extiende BaseEmailProvider para reusar sendEmail/sendBulkEmails
 *   - Operaciones agrupadas por dominio (lists, subscribers, templates, campaigns)
 *   - Errores: cada metodo retorna un objeto con `success` y `error?` o lanza AppError
 *     con mensaje claro para el caller
 *   - Tipado fuerte: prohibido `any`
 */

// ============================================================================
// Tipos comunes
// ============================================================================

export interface ListData {
  name: string;
  fromEmail?: string;
  fromName?: string;
  description?: string;
  contactCompany?: string;
  contactState?: string;
  contactAddress1?: string;
  contactAddress2?: string;
  contactCity?: string;
  contactZip?: string;
  contactPhone?: string;
  contactCountryId?: string;
  contactEmail?: string;
  contactUrl?: string;
  subscribeConfirmation?: boolean;
  sendWelcomeEmail?: boolean;
  unsubscribeNotification?: boolean;
}

export interface SubscriberData {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  status?: "subscribed" | "unsubscribed" | "blocklisted" | "pending";
  attributes?: Record<string, string | number | boolean>;
}

export interface TemplateData {
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  type: "campaign" | "tx";
  previewText?: string;
}

export interface CampaignData {
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  providerListIds: string[];          // IDs externos en el provider
  providerTemplateId?: string | null;
  sendAt?: Date | null;
  trackOpens?: boolean;
  trackClicks?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface TestSendData {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  fromEmail: string;
  fromName: string;
}

export interface ImportContact {
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, string | number | boolean>;
}

// ============================================================================
// Resultados
// ============================================================================

export interface ProviderResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface ProviderListResult {
  providerListId: string;
}

export interface ProviderSubscriberResult {
  providerSubscriberId: string;
  status: string;
}

export interface ProviderTemplateResult {
  providerTemplateId: string;
}

export interface ProviderCampaignResult {
  providerCampaignId: string;
  status: string;
}

export interface ImportResult {
  totalRequested: number;
  totalImported: number;
  totalFailed: number;
  errors: Array<{ email: string; error: string }>;
}

// ============================================================================
// Clase abstracta
// ============================================================================

export abstract class EmailMarketingProvider extends BaseEmailProvider {
  /** Nombre canonico del provider (`acelle` | `listmonk`). */
  abstract getProviderName(): string;

  // -----------------------------------------------
  // Lists
  // -----------------------------------------------
  abstract createList(data: ListData): Promise<ProviderResult<ProviderListResult>>;
  abstract updateList(
    providerListId: string,
    data: Partial<ListData>
  ): Promise<ProviderResult>;
  abstract deleteList(providerListId: string): Promise<ProviderResult>;

  // -----------------------------------------------
  // Subscribers
  // -----------------------------------------------
  abstract createSubscriber(
    providerListId: string,
    data: SubscriberData
  ): Promise<ProviderResult<ProviderSubscriberResult>>;
  abstract updateSubscriber(
    providerListId: string,
    data: SubscriberData
  ): Promise<ProviderResult>;
  abstract deleteSubscriber(
    providerListId: string,
    email: string
  ): Promise<ProviderResult>;
  abstract importSubscribers(
    providerListId: string,
    contacts: ImportContact[]
  ): Promise<ProviderResult<ImportResult>>;

  // -----------------------------------------------
  // Templates
  // -----------------------------------------------
  abstract createTemplate(
    data: TemplateData
  ): Promise<ProviderResult<ProviderTemplateResult>>;
  abstract updateTemplate(
    providerTemplateId: string,
    data: Partial<TemplateData>
  ): Promise<ProviderResult>;
  abstract deleteTemplate(providerTemplateId: string): Promise<ProviderResult>;

  // -----------------------------------------------
  // Campaigns
  // -----------------------------------------------
  abstract createCampaign(
    data: CampaignData
  ): Promise<ProviderResult<ProviderCampaignResult>>;
  abstract scheduleCampaign(
    providerCampaignId: string,
    sendAt: Date
  ): Promise<ProviderResult>;
  abstract startCampaign(providerCampaignId: string): Promise<ProviderResult>;
  abstract cancelCampaign(providerCampaignId: string): Promise<ProviderResult>;

  // -----------------------------------------------
  // Test send
  // -----------------------------------------------
  abstract sendTest(data: TestSendData): Promise<ProviderResult<SendEmailResponse>>;

  // -----------------------------------------------
  // Validation
  // -----------------------------------------------
  abstract validateConfig(): Promise<boolean>;

  // -----------------------------------------------
  // Helpers compartidos
  // -----------------------------------------------

  /**
   * Helper estandar para envolver respuestas exitosas.
   */
  protected ok<T>(data?: T): ProviderResult<T> {
    return { success: true, data };
  }

  /**
   * Helper estandar para envolver errores.
   */
  protected fail(error: unknown, context: string): ProviderResult<never> {
    const err = error as { message?: string; response?: { status?: number; data?: { message?: string } } };
    const message = err?.response?.data?.message || err?.message || "Unknown error";
    const statusCode = err?.response?.status;
    this.logActivity(`Error en ${context}`, { error: message, statusCode }, "error");
    return { success: false, error: message, statusCode };
  }

  /**
   * Validar email format (RFC 5322 simplificado).
   */
  protected isValidEmail(email: string): boolean {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim().toLowerCase());
  }

  /**
   * Splitear nombre completo en first/last.
   */
  protected splitName(name?: string): { firstName: string; lastName: string } {
    if (!name) return { firstName: "", lastName: "" };
    const parts = name.trim().split(/\s+/);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" ") || ""
    };
  }
}

export default EmailMarketingProvider;
