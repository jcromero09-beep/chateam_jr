/**
 * Handler de Coexistencia: smb_message_echoes
 *
 * Procesa mensajes enviados por el staff desde la WhatsApp Business App.
 * Crea un Message con fromMe: true y sourceChannel: 'business_app'.
 * NO activa chatbots, IA, ni FlowBuilder (es mensaje del staff, no del cliente).
 * Deduplicación por wid para evitar duplicados con webhook "messages".
 */
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import Contact from "../../models/Contact";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import CompaniesSettings from "../../models/CompaniesSettings";
import { getIO } from "../../libs/socket";
// FASE 2 Coexistencia — dedupe e idempotencia
import InboundEventLedgerService from "../CoexistenceServices/InboundEventLedgerService";
import {
  logInbound as coexLogInbound
} from "../../utils/coexistenceLogger";

/**
 * Procesa el webhook smb_message_echoes de Meta Coexistencia
 * @param entry - El entry completo del webhook (contiene WABA ID)
 * @param value - El value del change (contiene metadata + message_echoes)
 */
export const handleSmbMessageEchoes = async (entry: any, value: any): Promise<void> => {
  try {
    const phoneNumberId = value?.metadata?.phone_number_id;
    const displayPhoneNumber = value?.metadata?.display_phone_number;

    if (!phoneNumberId) {
      console.warn("[SmbEchoes] ⚠️ Sin phone_number_id en metadata");
      return;
    }

    // Resolver conexión Meta por phoneNumberId
    const whatsapp = await Whatsapp.findOne({
      where: { phoneNumberId, provider: "meta" }
    });

    if (!whatsapp) {
      console.error("[SmbEchoes] ❌ Conexión no encontrada para phoneNumberId:", phoneNumberId);
      return;
    }

    const companyId = whatsapp.companyId;

    // ══════ ROUTING COEXISTENCIA ══════
    // Si la conexión tiene coexistencia activa y canal de envío configurado,
    // determinar qué conexión y canal usar para crear el ticket
    let effectiveWhatsapp: any = whatsapp;
    let effectiveChannel: string = "meta";

    if (whatsapp.coexistenceEnabled && whatsapp.sendChannel === "baileys" && whatsapp.linkedWhatsappId) {
      const linkedBaileys = await Whatsapp.findByPk(whatsapp.linkedWhatsappId);
      if (linkedBaileys && linkedBaileys.status === "CONNECTED") {
        effectiveWhatsapp = linkedBaileys;
        effectiveChannel = "whatsapp";
        console.log(`[SmbEchoes] 🔗 Coexistencia activa: ticket → Baileys id=${linkedBaileys.id} (${linkedBaileys.name})`);
      } else {
        console.warn(`[SmbEchoes] ⚠️ linkedWhatsappId=${whatsapp.linkedWhatsappId} no está CONNECTED, usando Meta`);
      }
    }

    const messageEchoes = value?.message_echoes || [];

    if (!messageEchoes.length) {
      console.log("[SmbEchoes] ℹ️ message_echoes vacío, nada que procesar");
      return;
    }

    for (const echo of messageEchoes) {
      // ═══ FASE 2 Coexistencia — DEDUPE PRE-PROCESAMIENTO ═══
      const echoMessageId = echo?.id as string | undefined;
      let ledgerEntryId: number | null = null;
      if (echoMessageId) {
        // EventKey distinto del 'meta:wamid' normal, para permitir que
        // messages y smb_message_echoes coexistan como eventos diferentes
        // cuando aplique, pero manteniendo idempotencia dentro del mismo
        // tipo. Si YA procesamos el inbound normal con mismo wamid, también
        // debemos descartar el echo (es el mismo mensaje del negocio).
        //
        // Estrategia:
        //  - Primero intentar insertar 'meta_echo:wamid' → dedupe entre echoes.
        //  - Si hay un 'meta:wamid' ya procesado (por error: Meta no debería
        //    enviar ambos, pero por seguridad), lo detectaremos via
        //    Message.findOne posterior, que también existe.
        const ledger = await InboundEventLedgerService.registerOrDrop({
          companyId,
          provider: "meta_echo",
          eventKey: echoMessageId,
          providerMessageId: echoMessageId,
          payload: echo
        });
        if (!ledger.accepted) {
          console.log(
            `[SmbEchoes] ⏭️  Dedup (ledger): echo ${echoMessageId} ya procesado (reason=${ledger.reason})`
          );
          coexLogInbound({
            provider: "meta",
            companyId,
            wid: echoMessageId,
            phoneNumberId,
            fromMe: true,
            sourceChannel: "business_app",
            outcome: ledger.reason === "duplicate" ? "duplicate" : "echo_detected",
            reason: `ledger.${ledger.reason}`
          });
          continue;
        }
        ledgerEntryId = ledger.id;
      }
      // ════════════════════════════════════════════════════════
      try {
        const messageId = echo.id; // wamid.UNIQUE_ID
        const toNumber = echo.to; // Número del cliente (destino)
        const timestamp = echo.timestamp;
        const messageType = echo.type;

        // ===== Deduplicación por wid (defensa en profundidad) =====
        if (messageId) {
          const existing = await Message.findOne({ where: { wid: messageId } });
          if (existing) {
            console.log(`[SmbEchoes] Dedup Message: mensaje ${messageId} ya existe, omitiendo`);
            // Marcar ledger como 'dropped' — no es nuevo realmente
            await InboundEventLedgerService.markDropped(
              ledgerEntryId,
              "already_persisted_as_inbound",
              { provider: "meta_echo", companyId, wid: messageId }
            );
            continue;
          }
        }

        // ===== Extraer texto del mensaje =====
        let body = "";
        switch (messageType) {
          case "text":
            body = echo.text?.body || "";
            break;
          case "image":
            body = echo.image?.caption || "[Imagen]";
            break;
          case "video":
            body = echo.video?.caption || "[Video]";
            break;
          case "audio":
            body = "[Audio]";
            break;
          case "document":
            body = echo.document?.filename || "[Documento]";
            break;
          case "sticker":
            body = "[Sticker]";
            break;
          case "location":
            body = "📍 Ubicación";
            break;
          case "contacts":
            body = "👤 Contacto";
            break;
          default:
            body = `[${messageType || "desconocido"}]`;
        }

        // ===== Buscar/crear contacto del destinatario =====
        const contactNumber = `+${toNumber}`;
        const contactData = {
          name: contactNumber, // Se actualizará si ya existe
          number: contactNumber,
          profilePicUrl: "",
          isGroup: false,
          companyId,
          channel: effectiveChannel,
          whatsappId: effectiveWhatsapp.id
        };
        const contact = await CreateOrUpdateContactService(contactData);

        // ===== Buscar/crear ticket =====
        const settings = await CompaniesSettings.findOne({ where: { companyId } });
        const ticket = await FindOrCreateTicketService(
          contact,
          effectiveWhatsapp,
          0, // unreadMessages: 0 (es mensaje propio)
          companyId,
          0,
          0,
          null,
          effectiveChannel,
          null,
          false,
          settings
        );

        // ===== Crear mensaje con fromMe: true =====
        const messageData = {
          wid: messageId,
          ticketId: ticket.id,
          contactId: undefined, // fromMe no tiene contactId
          body,
          fromMe: true,
          read: true,
          quotedMsgId: undefined,
          ack: 3, // Enviado desde Business App = ya entregado
          dataJson: JSON.stringify(echo),
          channel: "meta",
          sourceChannel: "business_app" as string,
        };

        await CreateMessageService({ messageData, companyId });

        // Actualizar último mensaje del ticket
        await ticket.update({ lastMessage: body });

        // Emitir evento socket para actualizar UI en tiempo real
        const io = getIO();
        io.of(String(companyId))
          .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket
          });

        console.log(
          `[SmbEchoes] ✅ Eco procesado: ${messageId} → ticket #${ticket.id} (${body.substring(0, 50)})`
        );

        // FASE 2 Coexistencia — marcar ledger como procesado con ticketId
        await InboundEventLedgerService.markProcessed(ledgerEntryId, {
          ticketId: ticket.id
        });

      } catch (echoErr) {
        console.error("[SmbEchoes] ❌ Error procesando echo individual:", echoErr);
        // FASE 2 Coexistencia — marcar ledger como error
        await InboundEventLedgerService.markError(ledgerEntryId, echoErr);
      }
    }

    // Actualizar lastAppOpenedAt (si envían desde la App, la App está abierta)
    await whatsapp.update({ lastAppOpenedAt: new Date() });

  } catch (err) {
    console.error("[SmbEchoes] ❌ Error general:", err);
  }
};
