/**
 * metaPhoneLookupService — Descubrir Phone Numbers vía Token de Sistema
 *
 * Dado un Permanent System User Token (+ WABA ID opcional),
 * retorna la lista de números de teléfono disponibles con sus IDs.
 *
 * Flujo:
 * 1. Si wabaId proporcionado → consulta directamente /{wabaId}/phone_numbers
 * 2. Si NO wabaId → usa /me/owned_whatsapp_business_accounts para descubrir WABAs
 */
import axios from "axios";
import logger from "../../utils/logger";

const GRAPH_API_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export interface PhoneNumberInfo {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string;
  wabaId: string;
  platformType?: string;          // CLOUD_API | ON_PREMISE
  codeVerificationStatus?: string; // VERIFIED | NOT_VERIFIED
}

interface LookupResult {
  phoneNumbers: PhoneNumberInfo[];
  wabaIds: string[];
}

/**
 * Obtiene WABAs accesibles con el token
 * Intenta primero owned_whatsapp_business_accounts, luego client_whatsapp_business_accounts
 */
async function detectWabaIdsFromToken(accessToken: string): Promise<string[]> {
  // Intento 1: WABAs propios del usuario de sistema
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/me/owned_whatsapp_business_accounts`, {
      params: { access_token: accessToken, fields: "id,name" },
    });
    const ids: string[] = (data?.data || []).map((w: { id: string }) => w.id);
    if (ids.length > 0) {
      logger.info(`[PhoneLookup] WABAs detectados (owned): ${ids.join(", ")}`);
      return ids;
    }
  } catch (err: any) {
    logger.warn(`[PhoneLookup] owned_whatsapp_business_accounts: ${err.message}`);
  }

  // Intento 2: WABAs de clientes asignados
  try {
    const { data } = await axios.get(`${GRAPH_BASE}/me/client_whatsapp_business_accounts`, {
      params: { access_token: accessToken, fields: "id,name" },
    });
    const ids: string[] = (data?.data || []).map((w: { id: string }) => w.id);
    if (ids.length > 0) {
      logger.info(`[PhoneLookup] WABAs detectados (client): ${ids.join(", ")}`);
      return ids;
    }
  } catch (err: any) {
    logger.warn(`[PhoneLookup] client_whatsapp_business_accounts: ${err.message}`);
  }

  return [];
}

/**
 * Obtiene los Phone Numbers de un WABA específico
 */
async function getPhoneNumbersForWaba(
  wabaId: string,
  accessToken: string
): Promise<PhoneNumberInfo[]> {
  const { data } = await axios.get(`${GRAPH_BASE}/${wabaId}/phone_numbers`, {
    params: {
      access_token: accessToken,
      fields: "id,display_phone_number,verified_name,quality_rating,platform_type,code_verification_status",
    },
  });

  const phones = (data?.data || []).map((p: {
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
    platform_type?: string;
    code_verification_status?: string;
  }) => ({
    id: p.id,
    displayPhoneNumber: p.display_phone_number || "",
    verifiedName: p.verified_name || "",
    qualityRating: p.quality_rating || "UNKNOWN",
    wabaId,
    platformType: p.platform_type || "UNKNOWN",
    codeVerificationStatus: p.code_verification_status || "UNKNOWN",
  }));

  // Log diagnóstico de cada número
  for (const ph of phones) {
    logger.info(`[PhoneLookup] Número ${ph.displayPhoneNumber} (id: ${ph.id}) → platform_type: ${ph.platformType} | code_verification_status: ${ph.codeVerificationStatus}`);
  }

  return phones;
}

/**
 * Descubre todos los Phone Numbers accesibles con el token
 *
 * @param accessToken  Permanent System User Token
 * @param wabaId       WABA ID (opcional — si se omite se auto-detecta)
 */
export async function lookupPhoneNumbers(
  accessToken: string,
  wabaId?: string
): Promise<LookupResult> {
  let wabaIds: string[] = [];

  if (wabaId && wabaId.trim()) {
    wabaIds = [wabaId.trim()];
    logger.info(`[PhoneLookup] Usando WABA ID provisto: ${wabaId}`);
  } else {
    logger.info("[PhoneLookup] Auto-detectando WABAs del token...");
    wabaIds = await detectWabaIdsFromToken(accessToken);

    if (wabaIds.length === 0) {
      throw new Error(
        "No se encontraron cuentas WhatsApp Business accesibles con este token. " +
        "Verifica que el usuario de sistema tenga permisos 'whatsapp_business_management' " +
        "y tenga asignados los activos de WABA."
      );
    }
  }

  const allPhoneNumbers: PhoneNumberInfo[] = [];

  for (const wId of wabaIds) {
    try {
      const phones = await getPhoneNumbersForWaba(wId, accessToken);
      allPhoneNumbers.push(...phones);
      logger.info(`[PhoneLookup] WABA ${wId}: ${phones.length} número(s)`);
    } catch (err: any) {
      logger.warn(`[PhoneLookup] Error en WABA ${wId}: ${err.message}`);
    }
  }

  if (allPhoneNumbers.length === 0) {
    throw new Error(
      "No se encontraron números de teléfono en las cuentas WhatsApp Business. " +
      "Verifica que el activo WABA esté asignado al usuario de sistema con los permisos correctos."
    );
  }

  return { phoneNumbers: allPhoneNumbers, wabaIds };
}
