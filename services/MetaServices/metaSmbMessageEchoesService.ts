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
import CreateMessageService from "../MessageServices/CreateMessageService";
import CompaniesSettings from "../../models/CompaniesSettings";
import { getIO } from "../../libs/socket";
import { processMetaMessageEdit } from "./processMetaMessageEdit";
// FASE 2 Coexistencia — dedupe e idempotencia
import InboundEventLedgerService from "../CoexistenceServices/InboundEventLedgerService";
import {
  logInbound as coexLogInbound
} from "../../utils/coexistenceLogger";
// Servicio central de coexistencia — ticket canónico único + dedupe cross-provider
import CoexistenceTicketRoutingService from "../CoexistenceServices/CoexistenceTicketRoutingService";

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

    if (whatsapp.coexistenceEnabled && whatsapp.receiveChannel === "baileys") {
      console.warn(
        `[SmbEchoes] ⛔ Ignorado: receiveChannel=baileys para whatsappId=${whatsapp.id}`
      );
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
      // ═══ DETECCIÓN DE MENSAJES EDITADOS (type: "edit") ═══
      // Cuando el staff edita un mensaje desde WA Business App,
      // Meta envía un echo con type="edit" + edit.original_message_id
      if (echo?.type === "edit") {
        console.log(`[SmbEchoes] ✏️ Detectado echo type=edit, delegando a processMetaMessageEdit`);
        try {
          await processMetaMessageEdit(echo, companyId);
        } catch (editErr: any) {
          console.error(`[SmbEchoes] ❌ Error procesando edit: ${editErr.message}`);
        }
        continue;
      }

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

        // ═══ TICKET CANÓNICO ÚNICO (coexistencia) ═══
        // Resolver UnifiedConversation y reutilizar el ticket abierto de la
        // conversación (aunque viva en el transporte Baileys hermano). Evita
        // que el echo del staff abra un segundo ticket para la misma charla.
        const settings = await CompaniesSettings.findOne({ where: { companyId } });
        const { ticket, conversationId } =
          await CoexistenceTicketRoutingService.resolveOrCreateCanonicalTicket({
            contact,
            whatsapp: effectiveWhatsapp,
            companyId,
            unreadMessages: 0, // es mensaje propio
            inboundChannel: effectiveChannel === "meta" ? "meta" : "baileys",
            channel: effectiveChannel,
            settings
          });

        // ═══ DEDUPE CROSS-PROVIDER: meta_echo vs baileys_fromme ═══
        // Si Baileys YA guardó este mismo mensaje saliente (mismo ticket,
        // mismo body normalizado, ventana corta), NO crear otro mensaje.
        const equivalent =
          await CoexistenceTicketRoutingService.findEquivalentOutboundMessage({
            companyId,
            ticketId: ticket.id,
            body,
            windowMs: 120_000,
            excludeSourceChannels: ["business_app", "cloud_api"]
          });
        if (equivalent) {
          console.log(
            `[SmbEchoes] ⏭️  Dedup cross-provider: echo ${messageId} equivale a msg#${(equivalent as any).id} (${(equivalent as any).sourceChannel}) en ticket #${ticket.id}; no se duplica`
          );
          coexLogInbound({
            provider: "meta",
            companyId,
            ticketId: ticket.id,
            conversationId,
            wid: messageId,
            phoneNumberId,
            fromMe: true,
            sourceChannel: "business_app",
            outcome: "duplicate",
            reason: "cross_provider.baileys_fromme_recent"
          });
          await InboundEventLedgerService.markDropped(
            ledgerEntryId,
            "cross_provider.baileys_fromme_recent",
            { provider: "meta_echo", companyId, wid: messageId }
          );
          continue;
        }

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
          provider: "meta",
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
