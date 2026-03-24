/**
 * Handler de Coexistencia: smb_app_state_sync
 *
 * Procesa actualizaciones de contactos desde la WhatsApp Business App.
 * Acciones: add, modify (delete no se ejecuta — BD SAGRADA).
 */
import Whatsapp from "../../models/Whatsapp";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";

/**
 * Procesa el webhook smb_app_state_sync de Meta Coexistencia
 * @param entry - El entry completo del webhook
 * @param value - El value del change con contact updates
 */
export const handleSmbAppStateSync = async (entry: any, value: any): Promise<void> => {
  try {
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!phoneNumberId) {
      console.warn("[SmbAppStateSync] ⚠️ Sin phone_number_id en metadata");
      return;
    }

    // Resolver conexión Meta por phoneNumberId
    const whatsapp = await Whatsapp.findOne({
      where: { phoneNumberId, provider: "meta" }
    });

    if (!whatsapp) {
      console.error("[SmbAppStateSync] ❌ Conexión no encontrada para:", phoneNumberId);
      return;
    }

    const companyId = whatsapp.companyId;

    // Procesar actualizaciones de contactos
    const contacts = value?.contacts || [];

    for (const contactUpdate of contacts) {
      try {
        const action = contactUpdate?.action; // 'add' | 'modify' | 'delete'
        const phoneNumber = contactUpdate?.phone;
        const fullName = contactUpdate?.full_name || contactUpdate?.name || "";

        if (!phoneNumber) {
          console.warn("[SmbAppStateSync] ⚠️ Contacto sin número de teléfono, omitiendo");
          continue;
        }

        if (action === "delete") {
          // BD SAGRADA: NO borrar contactos, solo loguear
          console.log(`[SmbAppStateSync] ⚠️ Delete ignorado (BD SAGRADA): ${phoneNumber}`);
          continue;
        }

        // add o modify → crear o actualizar contacto
        const contactData = {
          name: fullName || `+${phoneNumber}`,
          number: `+${phoneNumber}`,
          profilePicUrl: "",
          isGroup: false,
          companyId,
          channel: "meta",
          whatsappId: whatsapp.id
        };

        await CreateOrUpdateContactService(contactData);

        console.log(
          `[SmbAppStateSync] ✅ Contacto ${action}: ${fullName || phoneNumber}`
        );

      } catch (contactErr) {
        console.error("[SmbAppStateSync] ❌ Error en contacto individual:", contactErr);
      }
    }

    // Actualizar lastAppOpenedAt (si sync de contactos llega, la App está activa)
    await whatsapp.update({ lastAppOpenedAt: new Date() });

  } catch (err) {
    console.error("[SmbAppStateSync] ❌ Error general:", err);
  }
};
