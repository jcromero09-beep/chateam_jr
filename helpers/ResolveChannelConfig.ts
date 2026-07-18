import Whatsapp from "../models/Whatsapp";
import Contact from "../models/Contact";
import CompaniesSettings from "../models/CompaniesSettings";

/**
 * Resolución jerárquica de configuración de mensajería.
 *
 * Jerarquía: Contact (override puntual) → Whatsapp (override por conexión) → CompaniesSettings (global empresa).
 * Un valor `null` en el nivel intermedio significa "heredar del nivel superior".
 *
 * Ejemplo:
 *   - CompaniesSettings.userRating='enabled' (global)
 *   - Whatsapp.npsEnabled=null            → hereda → activo
 *   - Whatsapp.npsEnabled=false           → override → INACTIVO en esta conexión
 *
 * Todos los helpers son tolerantes a fallos: si la BD lanza error o no existe la
 * configuración, devuelven el default seguro indicado.
 */

const readCompanySetting = async (
  companyId: number,
  key: keyof CompaniesSettings
): Promise<string | null> => {
  try {
    const settings = await CompaniesSettings.findOne({ where: { companyId } });
    if (!settings) return null;
    const raw = (settings as any)[key];
    return raw === undefined || raw === null ? null : String(raw);
  } catch {
    return null;
  }
};

/**
 * ¿Se debe enviar la encuesta NPS al cerrar este ticket?
 * Cascada: Whatsapp.npsEnabled → Settings.userRating='enabled'
 */
export const resolveNpsEnabled = async (
  whatsapp: Whatsapp | null | undefined,
  companyId: number
): Promise<boolean> => {
  if (whatsapp && whatsapp.npsEnabled !== null && whatsapp.npsEnabled !== undefined) {
    return Boolean(whatsapp.npsEnabled);
  }
  const value = await readCompanySetting(companyId, "userRating");
  return value === "enabled";
};

/**
 * ¿Se acepta audio entrante para este contacto?
 * Cascada: Contact.acceptAudioMessage → Whatsapp.acceptAudio → Settings.acceptAudioMessageContact
 *
 * Contact.acceptAudioMessage es boolean NOT NULL en BD, por lo que solo se considera
 * "no override" cuando el contacto fue creado heredando del setting global.
 * Para diferenciar override real, se usa solo si fue tocado explícitamente
 * (controlado en UI). Aquí asumimos que si está definido se respeta.
 */
export const resolveAcceptAudio = async (
  contact: Contact | null | undefined,
  whatsapp: Whatsapp | null | undefined,
  companyId: number,
  options: { trustContact?: boolean } = { trustContact: true }
): Promise<boolean> => {
  if (options.trustContact && contact && typeof contact.acceptAudioMessage === "boolean") {
    return contact.acceptAudioMessage;
  }
  if (whatsapp && whatsapp.acceptAudio !== null && whatsapp.acceptAudio !== undefined) {
    return Boolean(whatsapp.acceptAudio);
  }
  const value = await readCompanySetting(companyId, "acceptAudioMessageContact");
  return value === "enabled";
};

/**
 * Texto del mensaje a enviar cuando NO se acepta audio.
 * Solo vive en la conexión (no hay default global ni de contacto).
 */
export const resolveRejectAudioMessage = (
  whatsapp: Whatsapp | null | undefined
): string => {
  return (whatsapp?.rejectAudioMessage || "").trim();
};

/**
 * Texto del mensaje al rechazar una llamada entrante.
 * Solo vive en la conexión (Baileys no permite responder llamadas).
 */
export const resolveCallRejectMessage = (
  whatsapp: Whatsapp | null | undefined
): string => {
  return (whatsapp?.callRejectMessage || "").trim();
};

/**
 * Helper de auditoría: devuelve el snapshot resuelto de una conexión.
 * Útil para endpoints admin y debugging.
 */
export const resolveChannelSnapshot = async (
  whatsapp: Whatsapp,
  companyId: number
) => {
  const [npsEnabled, audioGlobal] = await Promise.all([
    resolveNpsEnabled(whatsapp, companyId),
    resolveAcceptAudio(null, whatsapp, companyId, { trustContact: false })
  ]);

  return {
    whatsappId: whatsapp.id,
    name: whatsapp.name,
    permissions: {
      npsEnabled: {
        effective: npsEnabled,
        connectionOverride: whatsapp.npsEnabled,
        source: whatsapp.npsEnabled === null || whatsapp.npsEnabled === undefined
          ? "global"
          : "connection"
      },
      acceptAudio: {
        effective: audioGlobal,
        connectionOverride: whatsapp.acceptAudio,
        source: whatsapp.acceptAudio === null || whatsapp.acceptAudio === undefined
          ? "global"
          : "connection"
      }
    },
    messages: {
      greeting: !!whatsapp.greetingMessage,
      farewell: !!whatsapp.farewellMessage,
      complation: !!whatsapp.complationMessage,
      outOfHours: !!whatsapp.outOfHoursMessage,
      rating: !!whatsapp.ratingMessage,
      callReject: !!whatsapp.callRejectMessage,
      rejectAudio: !!whatsapp.rejectAudioMessage,
      inactive: !!whatsapp.inactiveMessage
    }
  };
};

export default {
  resolveNpsEnabled,
  resolveAcceptAudio,
  resolveRejectAudioMessage,
  resolveCallRejectMessage,
  resolveChannelSnapshot
};
