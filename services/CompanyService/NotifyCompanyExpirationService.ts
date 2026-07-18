import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import CompaniesSettings from "../../models/CompaniesSettings";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

const LOG_PREFIX = "[NotifyCompanyExpiration]";

// Company ID del super admin donde se almacena la configuración global
const SUPER_ADMIN_COMPANY_ID = 1;

export type ExpirationMode = "warning" | "expired";

interface CompanyExpirationData {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  planId?: number;
  dueDate?: string;
  recurrence?: string;
  daysUntilDue?: number; // útil en modo "warning"
  daysAfterDue?: number; // útil en modo "expired"
}

const NotifyCompanyExpirationService = async (
  company: CompanyExpirationData,
  mode: ExpirationMode
): Promise<{ sent: number; total: number }> => {
  try {
    // 1. Leer configuración global del super admin
    const settings = await CompaniesSettings.findOne({
      where: { companyId: SUPER_ADMIN_COMPANY_ID }
    });

    if (!settings) {
      logger.warn(
        `${LOG_PREFIX} No se encontró configuración para companyId=${SUPER_ADMIN_COMPANY_ID}`
      );
      return { sent: 0, total: 0 };
    }

    // 2. Verificar si la alerta está habilitada
    if (settings.expirationAlertEnabled !== "enabled") {
      return { sent: 0, total: 0 };
    }

    // 3. Verificar números destino
    const phonesRaw = settings.expirationAlertPhone;
    if (!phonesRaw || phonesRaw.trim() === "") {
      logger.warn(`${LOG_PREFIX} No hay números destino configurados`);
      return { sent: 0, total: 0 };
    }

    const phones = phonesRaw
      .split(",")
      .map((p: string) => p.trim().replace(/\D/g, ""))
      .filter((p: string) => p.length >= 10);

    if (phones.length === 0) {
      logger.warn(`${LOG_PREFIX} Ningún número válido encontrado en: ${phonesRaw}`);
      return { sent: 0, total: 0 };
    }

    // 4. Verificar conexión WhatsApp
    const whatsappId = settings.expirationAlertWhatsappId;
    if (!whatsappId) {
      logger.warn(`${LOG_PREFIX} No hay conexión WhatsApp configurada`);
      return { sent: 0, total: 0 };
    }

    const whatsapp = await Whatsapp.findOne({
      where: { id: whatsappId, status: "CONNECTED" }
    });

    if (!whatsapp) {
      logger.warn(
        `${LOG_PREFIX} Conexión WhatsApp id=${whatsappId} no está CONNECTED`
      );
      return { sent: 0, total: 0 };
    }

    // 5. Construir mensaje según el modo
    const now = new Date().toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const dueDateLabel = company.dueDate
      ? new Date(company.dueDate).toLocaleDateString("es-MX", {
          timeZone: "America/Mexico_City",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        })
      : "—";

    let header: string;
    let subtitle: string;

    if (mode === "warning") {
      const days = typeof company.daysUntilDue === "number" ? company.daysUntilDue : 4;
      header = `⚠️ *Empresa por expirar*`;
      subtitle = `La empresa expirará en ${days} día${days === 1 ? "" : "s"}.`;
    } else {
      const days = typeof company.daysAfterDue === "number" ? company.daysAfterDue : 0;
      header = `🔴 *Empresa EXPIRADA*`;
      subtitle =
        days <= 0
          ? `La empresa venció hoy.`
          : `La empresa venció hace ${days} día${days === 1 ? "" : "s"}.`;
    }

    const message = [
      header,
      ``,
      subtitle,
      ``,
      `📋 *Datos de la empresa:*`,
      `• *Nombre:* ${company.name}`,
      `• *ID:* ${company.id}`,
      company.email ? `• *Email:* ${company.email}` : null,
      company.phone ? `• *Teléfono:* ${company.phone}` : null,
      company.document ? `• *Documento:* ${company.document}` : null,
      `• *Plan:* ${company.planId || "Demo"}`,
      `• *Vencimiento:* ${dueDateLabel}`,
      company.recurrence ? `• *Recurrencia:* ${company.recurrence}` : null,
      ``,
      mode === "expired"
        ? `🚫 Las conexiones WhatsApp de esta empresa serán desactivadas automáticamente.`
        : `⏳ Acción sugerida: contactar al cliente para renovación.`,
      ``,
      `📅 *Fecha del aviso:* ${now}`
    ]
      .filter(Boolean)
      .join("\n");

    // 6. Encolar mensajes (lazy import para evitar dependencias circulares)
    const { add } = require("../../queues");
    let sent = 0;

    for (const phone of phones) {
      try {
        await add(
          "SendMessage",
          {
            whatsappId: whatsapp.id,
            data: {
              number: phone,
              body: message,
              companyId: whatsapp.companyId
            }
          },
          {
            priority: 2,
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 3600, count: 50 }
          }
        );
        sent++;
      } catch (err: any) {
        logger.error(
          `${LOG_PREFIX} Error encolando mensaje a ${phone}: ${err.message}`
        );
      }
    }

    logger.info(
      `${LOG_PREFIX} 📱 ${sent}/${phones.length} alertas (${mode}) encoladas para empresa "${company.name}" (id=${company.id})`
    );
    return { sent, total: phones.length };
  } catch (error: any) {
    logger.error(`${LOG_PREFIX} Error general: ${error.message}`);
    return { sent: 0, total: 0 };
  }
};

export default NotifyCompanyExpirationService;
