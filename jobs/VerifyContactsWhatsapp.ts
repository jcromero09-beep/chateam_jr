import { Job } from "bull";
import axios from "axios";
import logger from "../utils/logger";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import { getIO } from "../libs/socket";

interface VerifyContactsWhatsappData {
  companyId: number;
  contactIds: number[];
}

// Espera entre verificaciones para no gatillar el anti-ban de WhatsApp.
// Alineado con WHATSAPP_MIN_DELAY_MS (2000ms) del sistema anti-ban.
const THROTTLE_MS = 2000;
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Ejecuta wbot.onWhatsApp en el NODO que tiene la sesión Baileys, vía el endpoint
 * interno /internal/wbot-call. El worker NO carga libs/wbot (evita el binario nativo
 * whatsapp-rust-bridge, que rompe el require() del registro de colas).
 */
async function remoteOnWhatsApp(
  port: number,
  whatsappId: number,
  jid: string
): Promise<any> {
  const url = `http://127.0.0.1:${port}/internal/wbot-call`;
  const resp = await axios.post(
    url,
    { whatsappId, method: "onWhatsApp", args: [jid] },
    { timeout: 30000, headers: { "Content-Type": "application/json" } }
  );
  return resp.data?.result;
}

/**
 * Verifica en background si los contactos importados tienen WhatsApp activo
 * (Baileys onWhatsApp), throttled. Marca whatsappValid = "valid" | "invalid" y
 * emite socket para refrescar el badge en tiempo real.
 *
 * Sesiones distribuidas: se busca una conexión Baileys CONECTADA cuya sesión esté
 * registrada en algún nodo (sessionRegistry) y se enruta la llamada a ese nodo.
 * Si no hay ninguna disponible, los contactos quedan en "pending". BD SAGRADA: solo UPDATE.
 */
export default async (job: Job<VerifyContactsWhatsappData>): Promise<void> => {
  const { companyId, contactIds } = job.data;

  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return;
  }

  // Import dinámico: sessionRegistry es seguro (solo Redis) y así no se carga en el
  // require() del registro de colas.
  const { sessionRegistry } = await import("../libs/sessionRegistry");

  // Conexiones Baileys CONECTADAS (Meta Cloud API no expone onWhatsApp de Baileys).
  const connections = await Whatsapp.findAll({
    where: { companyId, status: "CONNECTED", channel: "whatsapp", provider: "stable" },
    order: [["updatedAt", "DESC"]]
  });

  if (connections.length === 0) {
    logger.warn(
      `[VerifyContactsWhatsapp] company=${companyId} sin conexión Baileys CONECTADA; ` +
        `${contactIds.length} contactos quedan en 'pending'`
    );
    return;
  }

  // Elegir una conexión cuya sesión esté registrada en un nodo (puede estar en node-1 o node-2).
  let usedWid: number | null = null;
  let usedPort: number | null = null;
  for (const conn of connections) {
    try {
      const nodeInfo = await sessionRegistry.lookup(conn.id);
      if (nodeInfo?.port) {
        usedWid = conn.id;
        usedPort = nodeInfo.port;
        break;
      }
    } catch (err: any) {
      logger.warn(`[VerifyContactsWhatsapp] lookup wid=${conn.id} falló: ${err?.message}`);
    }
  }

  if (usedPort === null || usedWid === null) {
    logger.warn(
      `[VerifyContactsWhatsapp] Ninguna sesión Baileys registrada en los nodos para ` +
        `company=${companyId}; ${contactIds.length} contactos quedan en 'pending'`
    );
    return;
  }

  const io = getIO();
  let validCount = 0;
  let invalidCount = 0;

  logger.info(
    `[VerifyContactsWhatsapp] Verificando ${contactIds.length} contactos ` +
      `(company=${companyId}, wid=${usedWid}, port=${usedPort})`
  );

  for (const contactId of contactIds) {
    try {
      const contact = await Contact.findOne({ where: { id: contactId, companyId } });
      if (!contact || !contact.number) continue;

      const result = await remoteOnWhatsApp(
        usedPort,
        usedWid,
        `${contact.number}@s.whatsapp.net`
      );
      const entry = Array.isArray(result) ? result[0] : result;
      const isValid = !!entry?.exists;

      contact.whatsappValid = isValid ? "valid" : "invalid";
      contact.whatsappValidatedAt = new Date();
      await contact.save();

      if (isValid) validCount += 1;
      else invalidCount += 1;

      io.of(String(companyId)).emit(`company-${companyId}-contact`, {
        action: "update",
        contact
      });
    } catch (err: any) {
      logger.warn(
        `[VerifyContactsWhatsapp] Error verificando contact=${contactId}: ${err?.message}`
      );
    }

    await sleep(THROTTLE_MS);
  }

  logger.info(
    `[VerifyContactsWhatsapp] company=${companyId} completado: ` +
      `válidos=${validCount} inválidos=${invalidCount} de ${contactIds.length}`
  );
};
