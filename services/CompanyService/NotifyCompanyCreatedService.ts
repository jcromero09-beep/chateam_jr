import CompaniesSettings from "../../models/CompaniesSettings";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

const LOG_PREFIX = "[NotifyCompanyCreated]";

// Company ID del super admin donde se almacena la configuración global
const SUPER_ADMIN_COMPANY_ID = 1;

interface CompanyCreatedData {
  id: number;
  name: string;
  phone?: string;
  email?: string;
  document?: string;
  planId?: number;
  dueDate?: string;
  recurrence?: string;
}

const NotifyCompanyCreatedService = async (
  company: CompanyCreatedData,
  adminUserName?: string
): Promise<{ sent: number; total: number }> => {
  try {
    // 1. Leer configuración global del super admin
    const settings = await CompaniesSettings.findOne({
      where: { companyId: SUPER_ADMIN_COMPANY_ID }
    });

    if (!settings) {
      logger.warn(`${LOG_PREFIX} No se encontró configuración para companyId=${SUPER_ADMIN_COMPANY_ID}`);
      return { sent: 0, total: 0 };
    }

    // 2. Verificar si la alerta está habilitada
    if (settings.newCompanyAlertEnabled !== "enabled") {
      return { sent: 0, total: 0 };
    }

    // 3. Verificar números destino
    const phonesRaw = settings.newCompanyAlertPhone;
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
    const whatsappId = settings.newCompanyAlertWhatsappId;
    if (!whatsappId) {
      logger.warn(`${LOG_PREFIX} No hay conexión WhatsApp configurada para alertas`);
      return { sent: 0, total: 0 };
    }

    const whatsapp = await Whatsapp.findOne({
      where: { id: whatsappId, status: "CONNECTED" }
    });

    if (!whatsapp) {
      logger.warn(`${LOG_PREFIX} Conexión WhatsApp id=${whatsappId} no está CONNECTED`);
      return { sent: 0, total: 0 };
    }

    // 5. Construir mensaje
    const now = new Date().toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

    const message = [
      `🏢 *Nueva Empresa Registrada*`,
      ``,
      `📋 *Datos de la empresa:*`,
      `• *Nombre:* ${company.name}`,
      `• *ID:* ${company.id}`,
      company.phone ? `• *Teléfono:* ${company.phone}` : null,
      company.email ? `• *Email:* ${company.email}` : null,
      company.document ? `• *Documento:* ${company.document}` : null,
      `• *Plan:* ${company.planId || "Demo"}`,
      company.dueDate ? `• *Vencimiento:* ${company.dueDate}` : null,
      company.recurrence ? `• *Recurrencia:* ${company.recurrence}` : null,
      ``,
      adminUserName ? `👤 *Usuario Admin:* ${adminUserName}` : null,
      `📅 *Fecha:* ${now}`,
    ].filter(Boolean).join("\n");

    // 6. Enqueue mensajes (lazy import para evitar dependencias circulares)
    const { add } = require("../../queues");
    let sent = 0;

    for (const phone of phones) {
      try {
        await add("SendMessage", {
          whatsappId: whatsapp.id,
          data: {
            number: phone,
            body: message,
            companyId: whatsapp.companyId
          }
        }, {
          priority: 2,
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 3600, count: 50 }
        });
        sent++;
      } catch (err: any) {
        logger.error(`${LOG_PREFIX} Error encolando mensaje a ${phone}: ${err.message}`);
      }
    }

    logger.info(
      `${LOG_PREFIX} 📱 ${sent}/${phones.length} alertas encoladas para empresa "${company.name}" (id=${company.id})`
    );
    return { sent, total: phones.length };

  } catch (error: any) {
    logger.error(`${LOG_PREFIX} Error general: ${error.message}`);
    return { sent: 0, total: 0 };
  }
};

export default NotifyCompanyCreatedService;
