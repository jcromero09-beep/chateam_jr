/**
 * Handler de Coexistencia: history
 *
 * Procesa la sincronización de mensajes históricos (hasta 180 días, solo texto).
 * Se ejecuta minutos después del onboarding de Coexistencia.
 * Crea contactos, tickets y mensajes con sourceChannel: 'history_import'.
 * NO activa chatbots, IA, ni FlowBuilder.
 */
import Whatsapp from "../../models/Whatsapp";
import Message from "../../models/Message";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import CompaniesSettings from "../../models/CompaniesSettings";

/**
 * Procesa el webhook history de Meta Coexistencia
 * @param entry - El entry completo del webhook
 * @param value - El value del change con history_context + threads
 */
export const handleHistorySync = async (entry: any, value: any): Promise<void> => {
  try {
    const phoneNumberId = value?.metadata?.phone_number_id;
    const historyContext = value?.history_context;

    if (!phoneNumberId) {
      console.warn("[HistorySync] ⚠️ Sin phone_number_id en metadata");
      return;
    }

    // Log de progreso
    const phase = historyContext?.phase || "unknown";
    const chunkOrder = historyContext?.chunk_order || 0;
    const progress = historyContext?.progress || 0;
    const status = historyContext?.status || "unknown";

    console.log(
      `[HistorySync] 📜 Phase: ${phase}, Chunk: ${chunkOrder}, Progress: ${progress}%, Status: ${status}`
    );

    // Manejar error de historial desactivado
    if (status === "error" || historyContext?.error_code === 2593109) {
      console.warn("[HistorySync] ⚠️ El usuario desactivó el historial desde la Business App");
      // Actualizar estado de coexistencia
      await Whatsapp.update(
        { coexistenceStatus: "active" }, // Activo pero sin historial
        { where: { phoneNumberId, provider: "meta" } }
      );
      return;
    }

    // Resolver conexión Meta por phoneNumberId
    const whatsapp = await Whatsapp.findOne({
      where: { phoneNumberId, provider: "meta" }
    });

    if (!whatsapp) {
      console.error("[HistorySync] ❌ Conexión no encontrada para:", phoneNumberId);
      return;
    }

    const companyId = whatsapp.companyId;
    const settings = await CompaniesSettings.findOne({ where: { companyId } });

    // Actualizar estado de sincronización
    await whatsapp.update({ coexistenceStatus: "syncing" });

    // Procesar threads (mapa: número del contacto → array de mensajes)
    const threads = value?.threads || {};
    let importedCount = 0;

    for (const [contactNumber, messages] of Object.entries(threads)) {
      try {
        const msgArray = messages as any[];
        if (!msgArray?.length) continue;

        // Crear/actualizar contacto
        const contactData = {
          name: `+${contactNumber}`,
          number: `+${contactNumber}`,
          profilePicUrl: "",
          isGroup: false,
          companyId,
          channel: "meta",
          whatsappId: whatsapp.id
        };
        const contact = await CreateOrUpdateContactService(contactData);

        // Buscar/crear ticket
        const ticket = await FindOrCreateTicketService(
          contact,
          whatsapp,
          0, // Sin unread
          companyId,
          0,
          0,
          null,
          "meta",
          null,
          false,
          settings
        );

        // Importar cada mensaje del historial
        for (const msg of msgArray) {
          try {
            const messageId = msg.id;

            // Deduplicación
            if (messageId) {
              const existing = await Message.findOne({ where: { wid: messageId } });
              if (existing) continue;
            }

            const fromMe = msg.from === phoneNumberId || msg.from === whatsapp.displayPhoneNumber;
            const body = msg.text?.body || `[${msg.type || "unknown"}]`;

            const messageData = {
              wid: messageId,
              ticketId: ticket.id,
              contactId: fromMe ? undefined : contact.id,
              body,
              fromMe,
              read: true, // Histórico = ya leído
              quotedMsgId: undefined,
              ack: 3,
              dataJson: JSON.stringify(msg),
              channel: "meta",
              sourceChannel: "history_import" as string,
              // Usar timestamp del mensaje original
              createdAt: msg.timestamp ? new Date(parseInt(msg.timestamp) * 1000) : undefined,
            };

            await CreateMessageService({ messageData, companyId });
            importedCount++;

          } catch (msgErr) {
            console.error("[HistorySync] Error en mensaje individual:", msgErr);
          }
        }

        // Actualizar último mensaje del ticket
        if (msgArray.length > 0) {
          const lastMsg = msgArray[msgArray.length - 1];
          await ticket.update({
            lastMessage: lastMsg?.text?.body || "[Historial importado]"
          });
        }

      } catch (threadErr) {
        console.error(`[HistorySync] Error en thread ${contactNumber}:`, threadErr);
      }
    }

    console.log(`[HistorySync] ✅ Importados ${importedCount} mensajes (chunk ${chunkOrder})`);

    // Si progreso = 100%, marcar como activo
    if (progress >= 100) {
      await whatsapp.update({ coexistenceStatus: "active" });
      console.log("[HistorySync] 🎉 Sincronización histórica completada");
    }

  } catch (err) {
    console.error("[HistorySync] ❌ Error general:", err);
  }
};
