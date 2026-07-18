import axios, { AxiosInstance, AxiosError } from "axios";
import FormData from "form-data";
import fs from "fs";
import path from "path";
import mime from "mime-types";
import logger from "../../../utils/logger";
import {
  EmailMarketingProvider,
  ListData,
  SubscriberData,
  TemplateData,
  CampaignData,
  TestSendData,
  ImportContact,
  ProviderResult,
  ProviderListResult,
  ProviderSubscriberResult,
  ProviderTemplateResult,
  ProviderCampaignResult,
  ImportResult
} from "./EmailMarketingProvider";
import {
  EmailMessage,
  SendEmailResponse,
  BulkEmailMessage,
  BulkSendResponse
} from "./BaseEmailProvider";

/**
 * ListmonkProvider — Email Marketing self-hosted (https://listmonk.app)
 *
 * Listmonk es un orquestador de email open-source que NO envia correos por
 * si mismo. Necesita un SMTP backend (mail.chateam.ws) configurado en su panel.
 *
 * Implementa la interfaz EmailMarketingProvider completa:
 *   - Lists: POST/PUT/DELETE /api/lists
 *   - Subscribers: POST/PUT/DELETE /api/subscribers
 *   - Import: POST /api/import/subscribers (o batch via /api/subscribers)
 *   - Templates: POST/PUT/DELETE /api/templates
 *   - Campaigns: POST/PUT /api/campaigns + status changes
 *   - Test: POST /api/campaigns/{id}/test
 *   - Tx: POST /api/tx (transaccional con template_id passthrough)
 *
 * Configuracion (EmailProviderConfig):
 *   - apiKey: API username (Listmonk API user)
 *   - apiSecret: API access token
 *   - settings.listmonkUrl: URL base, p.ej. "http://192.168.100.21:9000"
 *   - settings.fromEmail / settings.fromName: defaults
 *   - settings.passthroughTemplateId: id de template tipo "tx" passthrough
 *   - settings.transactionalListId: id de lista para transaccionales
 */
export class ListmonkProvider extends EmailMarketingProvider {
  private http: AxiosInstance;
  private url: string;
  private apiUser: string;
  private apiTokenStr: string;
  private fromEmailDefault: string;
  private fromNameDefault: string;
  private passthroughTemplateId: number;
  private transactionalListId: number;

  constructor(apiKey: string, apiSecret?: string, config: Record<string, any> = {}) {
    super(apiKey, apiSecret, config);

    const url = (config.listmonkUrl
      || config.url
      || process.env.LISTMONK_URL
      || ""
    ).replace(/\/+$/, "");

    if (!url) throw new Error("[Listmonk] settings.listmonkUrl es requerido");
    if (!apiKey) throw new Error("[Listmonk] apiKey (api user) es requerido");
    if (!apiSecret) throw new Error("[Listmonk] apiSecret (token) es requerido");

    this.url = url;
    this.apiUser = apiKey;
    this.apiTokenStr = apiSecret;
    this.fromEmailDefault = config.fromEmail
      || config.verifiedSenderEmail
      || process.env.LISTMONK_FROM_EMAIL
      || "";
    this.fromNameDefault = config.fromName
      || config.verifiedSenderName
      || process.env.LISTMONK_FROM_NAME
      || "";
    this.passthroughTemplateId = parseInt(
      String(
        config.passthroughTemplateId
        || config.listmonkPassthroughTemplateId
        || process.env.LISTMONK_PASSTHROUGH_TEMPLATE_ID
        || "0"
      ),
      10
    );
    this.transactionalListId = parseInt(
      String(
        config.transactionalListId
        || config.listmonkTransactionalListId
        || process.env.LISTMONK_TRANSACTIONAL_LIST_ID
        || "0"
      ),
      10
    );

    this.http = axios.create({
      baseURL: this.url,
      timeout: parseInt(process.env.LISTMONK_TIMEOUT_MS || "15000", 10),
      headers: {
        Authorization: `token ${this.apiUser}:${this.apiTokenStr}`,
        "Content-Type": "application/json"
      }
    });

    this.logActivity("Listmonk cliente inicializado", {
      url: this.url,
      passthroughTemplateId: this.passthroughTemplateId,
      transactionalListId: this.transactionalListId
    });
  }

  getProviderName(): string {
    return "listmonk";
  }

  // ============================================================================
  // Helpers internos
  // ============================================================================

  private fromHeader(email?: string, name?: string): string {
    const e = email || this.fromEmailDefault;
    const n = name || this.fromNameDefault;
    if (n) return `${n} <${e}>`;
    return e;
  }

  // ============================================================================
  // BaseEmailProvider — sendEmail / sendBulkEmails / verifySender / validateConfig
  // ============================================================================

  async sendEmail(message: EmailMessage): Promise<SendEmailResponse> {
    try {
      if (!this.passthroughTemplateId) {
        return {
          success: false,
          error:
            "settings.passthroughTemplateId no configurado. Cree una template tipo 'tx' con body `{{ .Tx.Data.html | Safe }}` y subject `{{ .Tx.Data.subject }}` en Listmonk."
        };
      }

      // Asegurar subscriber para /api/tx
      await this.ensureSubscriberInternal(message.to, message.toName, this.transactionalListId);

      const txPayload: Record<string, unknown> = {
        subscriber_email: message.to,
        template_id: this.passthroughTemplateId,
        from_email: this.fromHeader(message.from, message.fromName),
        headers: [{ "X-ChatEAM-Source": "transactional" }],
        content_type: "html",
        data: {
          subject: message.subject,
          html: message.htmlContent,
          text: message.textContent || ""
        }
      };

      const hasAttachments =
        Array.isArray(message.attachments) && message.attachments.length > 0;

      if (!hasAttachments) {
        // Camino rápido — JSON
        await this.http.post("/api/tx", txPayload);
        return {
          success: true,
          messageId: `listmonk-tx-${Date.now()}`,
          providerId: "listmonk"
        };
      }

      // Camino con attachments — multipart/form-data
      // https://listmonk.app/docs/apis/transactional/
      const form = new FormData();
      form.append("data", JSON.stringify(txPayload));

      let attachedCount = 0;
      let attachedBytes = 0;

      for (const att of message.attachments!) {
        if (!att) continue;
        const filename = att.filename || "attachment.bin";
        const contentType =
          att.contentType ||
          (att.path ? (mime.lookup(att.path) || "application/octet-stream") : "application/octet-stream");

        if (att.path) {
          // Validar que el archivo exista — fail-fast antes de gastar la request
          let stat;
          try {
            stat = fs.statSync(att.path);
          } catch {
            return {
              success: false,
              error: `Attachment path no existe: ${att.path}`
            };
          }
          if (!stat.isFile() || stat.size === 0) {
            return {
              success: false,
              error: `Attachment inválido (no es archivo o está vacío): ${att.path}`
            };
          }
          form.append("file", fs.createReadStream(att.path), {
            filename: filename || path.basename(att.path),
            contentType,
            knownLength: stat.size
          });
          attachedCount++;
          attachedBytes += stat.size;
        } else if (att.content !== undefined) {
          const buf =
            typeof att.content === "string"
              ? Buffer.from(att.content)
              : att.content;
          form.append("file", buf, { filename, contentType });
          attachedCount++;
          attachedBytes += buf.length;
        }
      }

      this.logActivity("Enviando /api/tx con attachments", {
        to: message.to,
        attachedCount,
        attachedBytes
      });

      // Importante: Authorization se conserva, Content-Type lo setea FormData
      await this.http.post("/api/tx", form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `token ${this.apiUser}:${this.apiTokenStr}`
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      return {
        success: true,
        messageId: `listmonk-tx-${Date.now()}`,
        providerId: "listmonk"
      };
    } catch (error) {
      return this.handleError(error, "sendEmail");
    }
  }

  async sendBulkEmails(message: BulkEmailMessage): Promise<BulkSendResponse> {
    const total = message.recipients.length;
    const results: BulkSendResponse["results"] = [];
    let sent = 0;

    for (const r of message.recipients) {
      const single = await this.sendEmail({
        to: r.email,
        toName: r.name,
        from: message.from,
        fromName: message.fromName,
        replyTo: message.replyTo,
        subject: message.subject,
        htmlContent: message.htmlContent,
        textContent: message.textContent
      });
      if (single.success) {
        sent++;
        results.push({ email: r.email, success: true, messageId: single.messageId });
      } else {
        results.push({ email: r.email, success: false, error: single.error });
      }
    }

    return {
      success: sent === total,
      totalRequested: total,
      totalSent: sent,
      totalFailed: total - sent,
      results
    };
  }

  async verifySender(_email: string): Promise<boolean> {
    return this.validateConfig();
  }

  async validateConfig(): Promise<boolean> {
    try {
      const { status } = await this.http.get("/api/config");
      return status === 200;
    } catch (err) {
      this.logActivity("validateConfig fallo", { error: (err as Error).message }, "error");
      return false;
    }
  }

  // ============================================================================
  // Lists
  // ============================================================================

  async createList(data: ListData): Promise<ProviderResult<ProviderListResult>> {
    try {
      const body = {
        name: data.name,
        type: "private",
        optin: data.subscribeConfirmation ? "double" : "single",
        tags: ["chateam"],
        description: data.description || ""
      };
      const { data: resp } = await this.http.post("/api/lists", body);
      const id = resp?.data?.id;
      if (!id) return { success: false, error: `Respuesta invalida: ${JSON.stringify(resp)}` };
      return this.ok({ providerListId: String(id) });
    } catch (err) {
      return this.fail(err, "createList");
    }
  }

  async updateList(
    providerListId: string,
    data: Partial<ListData>
  ): Promise<ProviderResult> {
    try {
      const body: Record<string, unknown> = {};
      if (data.name) body.name = data.name;
      if (data.description !== undefined) body.description = data.description;
      if (data.subscribeConfirmation !== undefined) {
        body.optin = data.subscribeConfirmation ? "double" : "single";
      }
      await this.http.put(`/api/lists/${providerListId}`, body);
      return this.ok();
    } catch (err) {
      return this.fail(err, "updateList");
    }
  }

  async deleteList(providerListId: string): Promise<ProviderResult> {
    try {
      await this.http.delete(`/api/lists/${providerListId}`);
      return this.ok();
    } catch (err) {
      return this.fail(err, "deleteList");
    }
  }

  // ============================================================================
  // Subscribers
  // ============================================================================

  /**
   * Crear/asegurar subscriber. Idempotente: si ya existe, lo busca y retorna.
   */
  private async ensureSubscriberInternal(
    email: string,
    name?: string,
    listIdNumeric?: number
  ): Promise<{ id: number; uuid: string } | null> {
    if (!email) return null;
    try {
      const lists = listIdNumeric && listIdNumeric > 0 ? [listIdNumeric] : [];
      const { data: resp } = await this.http.post("/api/subscribers", {
        email,
        name: name || email.split("@")[0],
        status: "enabled",
        lists,
        preconfirm_subscriptions: true
      });
      return { id: resp.data.id, uuid: resp.data.uuid };
    } catch (err) {
      const ax = err as AxiosError<{ message?: string }>;
      if (ax.response?.status === 409) {
        // Buscar existente
        const safe = email.replace(/'/g, "''");
        const { data } = await this.http.get("/api/subscribers", {
          params: { query: `subscribers.email = '${safe}'`, per_page: 1 }
        });
        const list = data?.data?.results || [];
        if (list.length > 0) {
          // Si tiene listId numerico, suscribir
          if (listIdNumeric && listIdNumeric > 0) {
            try {
              await this.http.put("/api/subscribers/lists", {
                ids: [list[0].id],
                action: "add",
                target_list_ids: [listIdNumeric],
                status: "confirmed"
              });
            } catch {
              // ignore
            }
          }
          return { id: list[0].id, uuid: list[0].uuid };
        }
      }
      throw err;
    }
  }

  async createSubscriber(
    providerListId: string,
    data: SubscriberData
  ): Promise<ProviderResult<ProviderSubscriberResult>> {
    try {
      if (!this.isValidEmail(data.email)) {
        return { success: false, error: `Email invalido: ${data.email}` };
      }
      const numericListId = parseInt(providerListId, 10);
      if (Number.isNaN(numericListId)) {
        return { success: false, error: `providerListId invalido: ${providerListId}` };
      }
      const sub = await this.ensureSubscriberInternal(data.email, data.name, numericListId);
      if (!sub) return { success: false, error: "No se pudo crear/encontrar subscriber" };
      return this.ok({
        providerSubscriberId: String(sub.id),
        status: "subscribed"
      });
    } catch (err) {
      return this.fail(err, "createSubscriber");
    }
  }

  async updateSubscriber(
    _providerListId: string,
    data: SubscriberData
  ): Promise<ProviderResult> {
    try {
      // Buscar el subscriber por email
      const safe = data.email.replace(/'/g, "''");
      const { data: search } = await this.http.get("/api/subscribers", {
        params: { query: `subscribers.email = '${safe}'`, per_page: 1 }
      });
      const found = search?.data?.results?.[0];
      if (!found) {
        return { success: false, error: `Subscriber no encontrado: ${data.email}` };
      }
      await this.http.put(`/api/subscribers/${found.id}`, {
        email: data.email,
        name: data.name || found.name,
        status: data.status === "blocklisted" ? "blocklisted" : "enabled",
        attribs: data.attributes || found.attribs || {},
        // Mantener listas existentes
        lists: (found.lists || []).map((l: { id: number }) => l.id)
      });
      return this.ok();
    } catch (err) {
      return this.fail(err, "updateSubscriber");
    }
  }

  async deleteSubscriber(
    providerListId: string,
    email: string
  ): Promise<ProviderResult> {
    try {
      // Listmonk: en lugar de DELETE total, des-suscribir de la lista
      const safe = email.replace(/'/g, "''");
      const { data: search } = await this.http.get("/api/subscribers", {
        params: { query: `subscribers.email = '${safe}'`, per_page: 1 }
      });
      const found = search?.data?.results?.[0];
      if (!found) return this.ok(); // ya no existe

      const numericListId = parseInt(providerListId, 10);
      if (!Number.isNaN(numericListId) && numericListId > 0) {
        await this.http.put("/api/subscribers/lists", {
          ids: [found.id],
          action: "remove",
          target_list_ids: [numericListId]
        });
      }
      return this.ok();
    } catch (err) {
      return this.fail(err, "deleteSubscriber");
    }
  }

  async importSubscribers(
    providerListId: string,
    contacts: ImportContact[]
  ): Promise<ProviderResult<ImportResult>> {
    const total = contacts.length;
    const errors: ImportResult["errors"] = [];
    let imported = 0;

    const numericListId = parseInt(providerListId, 10);
    if (Number.isNaN(numericListId)) {
      return { success: false, error: `providerListId invalido: ${providerListId}` };
    }

    // Iteramos uno por uno (ensureSubscriber maneja duplicados)
    for (const c of contacts) {
      if (!this.isValidEmail(c.email)) {
        errors.push({ email: c.email || "(vacio)", error: "Email invalido" });
        continue;
      }
      try {
        await this.ensureSubscriberInternal(c.email, c.name, numericListId);
        imported++;
      } catch (err) {
        const ax = err as AxiosError<{ message?: string }>;
        errors.push({
          email: c.email,
          error: ax.response?.data?.message || (err as Error).message
        });
      }
    }

    return this.ok({
      totalRequested: total,
      totalImported: imported,
      totalFailed: errors.length,
      errors
    });
  }

  // ============================================================================
  // Templates
  // ============================================================================

  async createTemplate(
    data: TemplateData
  ): Promise<ProviderResult<ProviderTemplateResult>> {
    try {
      // Listmonk plantillas:
      //   - type='tx': body usa {{ .Tx.Data.html | Safe }} (passthrough TX)
      //   - type='campaign': body DEBE incluir {{ template "content" . }}
      //     que es donde Listmonk inyecta el contenido de cada campana.
      //     Nuestro modelo guarda el HTML completo por plantilla, asi que
      //     creamos un wrapper passthrough en Listmonk y mandamos el HTML
      //     real en el body de cada campana.
      const isTx = data.type === "tx";
      const wrapper = isTx
        ? "{{ .Tx.Data.html | Safe }}"
        : '{{ template "content" . }}';

      const body: Record<string, unknown> = {
        name: data.name,
        type: data.type,
        body: wrapper
      };
      if (isTx) {
        body.subject = data.subject || "{{ .Tx.Data.subject }}";
      }

      const { data: resp } = await this.http.post("/api/templates", body);
      const id = resp?.data?.id;
      if (!id) return { success: false, error: `Respuesta invalida: ${JSON.stringify(resp)}` };
      return this.ok({ providerTemplateId: String(id) });
    } catch (err) {
      return this.fail(err, "createTemplate");
    }
  }

  async updateTemplate(
    providerTemplateId: string,
    data: Partial<TemplateData>
  ): Promise<ProviderResult> {
    try {
      const body: Record<string, unknown> = {};
      if (data.name) body.name = data.name;
      if (data.type) body.type = data.type;

      // Mantener wrapper passthrough — el HTML real vive en cada campana
      const isTx = data.type === "tx";
      if (data.htmlContent !== undefined) {
        body.body = isTx
          ? "{{ .Tx.Data.html | Safe }}"
          : '{{ template "content" . }}';
      }
      if (data.subject) {
        body.subject = isTx ? "{{ .Tx.Data.subject }}" : data.subject;
      }
      await this.http.put(`/api/templates/${providerTemplateId}`, body);
      return this.ok();
    } catch (err) {
      return this.fail(err, "updateTemplate");
    }
  }

  async deleteTemplate(providerTemplateId: string): Promise<ProviderResult> {
    try {
      await this.http.delete(`/api/templates/${providerTemplateId}`);
      return this.ok();
    } catch (err) {
      return this.fail(err, "deleteTemplate");
    }
  }

  // ============================================================================
  // Campaigns
  // ============================================================================

  async createCampaign(
    data: CampaignData
  ): Promise<ProviderResult<ProviderCampaignResult>> {
    try {
      if (!data.providerListIds || data.providerListIds.length === 0) {
        return { success: false, error: "providerListIds vacio" };
      }
      const lists = data.providerListIds.map(s => parseInt(s, 10)).filter(n => !Number.isNaN(n));
      if (lists.length === 0) return { success: false, error: "providerListIds invalidos (no numericos)" };

      const body: Record<string, unknown> = {
        name: data.name,
        subject: data.subject,
        from_email: this.fromHeader(data.fromEmail, data.fromName),
        type: "regular",
        content_type: "html",
        body: data.htmlContent,
        lists,
        messenger: "email",
        tags: ["chateam"]
      };
      if (data.providerTemplateId) {
        const tpl = parseInt(data.providerTemplateId, 10);
        if (!Number.isNaN(tpl)) body.template_id = tpl;
      }
      if (data.sendAt) {
        body.send_at = data.sendAt.toISOString();
      }
      if (data.metadata) {
        body.headers = Object.entries(data.metadata).map(([k, v]) => ({ [`X-Custom-${k}`]: String(v) }));
      }

      const { data: resp } = await this.http.post("/api/campaigns", body);
      const id = resp?.data?.id;
      if (!id) return { success: false, error: `Respuesta invalida: ${JSON.stringify(resp)}` };
      return this.ok({ providerCampaignId: String(id), status: "draft" });
    } catch (err) {
      return this.fail(err, "createCampaign");
    }
  }

  async scheduleCampaign(
    providerCampaignId: string,
    sendAt: Date
  ): Promise<ProviderResult> {
    try {
      // Listmonk PUT /api/campaigns/:id requiere el body completo de la campana.
      // Cargamos los datos actuales, actualizamos send_at y enviamos todo.
      const { data: current } = await this.http.get(`/api/campaigns/${providerCampaignId}`);
      const c = current?.data;
      if (!c) {
        return { success: false, error: "Campana no encontrada en provider" };
      }

      const lists: number[] = (c.lists || [])
        .map((l: { id: number }) => l.id)
        .filter((n: number) => Number.isFinite(n));

      const body: Record<string, unknown> = {
        name: c.name,
        subject: c.subject,
        from_email: c.from_email,
        type: c.type || "regular",
        content_type: c.content_type || "html",
        body: c.body || "",
        lists,
        send_at: sendAt.toISOString(),
        messenger: c.messenger || "email"
      };
      if (c.template_id) body.template_id = c.template_id;
      if (c.altbody) body.altbody = c.altbody;
      if (c.tags) body.tags = c.tags;
      if (c.headers) body.headers = c.headers;

      await this.http.put(`/api/campaigns/${providerCampaignId}`, body);

      // Cambiar a "scheduled". Si ya esta scheduled, retorna 200 igual.
      await this.http.put(`/api/campaigns/${providerCampaignId}/status`, {
        status: "scheduled"
      });
      return this.ok();
    } catch (err) {
      return this.fail(err, "scheduleCampaign");
    }
  }

  async startCampaign(providerCampaignId: string): Promise<ProviderResult> {
    try {
      await this.http.put(`/api/campaigns/${providerCampaignId}/status`, {
        status: "running"
      });
      return this.ok();
    } catch (err) {
      return this.fail(err, "startCampaign");
    }
  }

  async cancelCampaign(providerCampaignId: string): Promise<ProviderResult> {
    try {
      await this.http.put(`/api/campaigns/${providerCampaignId}/status`, {
        status: "cancelled"
      });
      return this.ok();
    } catch (err) {
      return this.fail(err, "cancelCampaign");
    }
  }

  // ============================================================================
  // Test send
  // ============================================================================

  async sendTest(data: TestSendData): Promise<ProviderResult<SendEmailResponse>> {
    try {
      // Estrategia 1: si tenemos passthroughTemplateId, usar /api/tx (rapido)
      if (this.passthroughTemplateId > 0) {
        await this.ensureSubscriberInternal(data.to, data.toName, this.transactionalListId);
        await this.http.post("/api/tx", {
          subscriber_email: data.to,
          template_id: this.passthroughTemplateId,
          from_email: this.fromHeader(data.fromEmail, data.fromName),
          headers: [{ "X-ChatEAM-Source": "test" }],
          content_type: "html",
          data: {
            subject: data.subject,
            html: data.htmlContent,
            text: data.textContent || ""
          }
        });
        return this.ok({
          success: true,
          messageId: `listmonk-test-${Date.now()}`,
          providerId: "listmonk"
        });
      }

      // Estrategia 2: crear campana borrador y usar /test endpoint
      const created = await this.createCampaign({
        name: `[TEST] ${data.subject} ${Date.now()}`,
        subject: data.subject,
        htmlContent: data.htmlContent,
        textContent: data.textContent,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        providerListIds: this.transactionalListId > 0
          ? [String(this.transactionalListId)]
          : []
      });
      if (!created.success || !created.data) {
        return { success: false, error: created.error || "No se pudo crear campana de test" };
      }
      await this.http.post(`/api/campaigns/${created.data.providerCampaignId}/test`, {
        subscribers: [data.to]
      });
      return this.ok({
        success: true,
        messageId: `listmonk-test-camp-${created.data.providerCampaignId}`,
        providerId: "listmonk"
      });
    } catch (err) {
      return this.fail(err, "sendTest");
    }
  }

  // ============================================================================
  // Analytics (helper publico para sync de bounces/opens/clicks)
  // ============================================================================

  /**
   * Obtener analytics de campanas por tipo. Util para job de sync.
   */
  async getCampaignAnalytics(
    campaignIds: number[],
    type: "views" | "clicks" | "bounces" | "links",
    fromIso?: string,
    toIso?: string
  ): Promise<unknown[]> {
    try {
      const params: Record<string, unknown> = { id: campaignIds };
      if (fromIso) params.from = fromIso;
      if (toIso) params.to = toIso;
      const { data } = await this.http.get(`/api/campaigns/analytics/${type}`, { params });
      return Array.isArray(data?.data) ? (data.data as unknown[]) : [];
    } catch (err) {
      this.logActivity(`getCampaignAnalytics(${type}) fallo`, { error: (err as Error).message }, "warn");
      return [];
    }
  }
}

export default ListmonkProvider;
