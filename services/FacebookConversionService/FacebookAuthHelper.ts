import axios from "axios";
import Company from "../../models/Company";
import CompaniesSettings from "../../models/CompaniesSettings";

/**
 * Generate App Access Token from Facebook App credentials
 * This token can be used for server-to-server API calls
 */
export async function generateAppAccessToken(
    appId: string,
    appSecret: string
): Promise<string> {
    try {
        const response = await axios.get("https://graph.facebook.com/oauth/access_token", {
            params: {
                client_id: appId,
                client_secret: appSecret,
                grant_type: "client_credentials"
            }
        });

        return response.data.access_token;
    } catch (error: any) {
        console.error("Error generating app access token:", error.response?.data || error.message);
        throw new Error(`Failed to generate access token: ${error.message}`);
    }
}

/**
 * Get access token for a company
 * Uses the company's Facebook App credentials
 * First checks Company model, then falls back to CompaniesSettings
 */
export async function getCompanyAccessToken(companyId: number): Promise<string> {
    console.log(`🔑 [getCompanyAccessToken] Buscando credenciales para company ${companyId}`);

    const company = await Company.findByPk(companyId);

    if (!company) {
        throw new Error(`Company ${companyId} not found`);
    }

    // Primero intentar obtener de Company
    let appId = company.facebookAppId;
    let appSecret = company.facebookAppSecret;

    console.log(`🔑 [getCompanyAccessToken] Company model - appId: ${appId ? appId.substring(0, 10) + '...' : 'NULL'}, appSecret: ${appSecret ? 'PRESENTE' : 'NULL'}`);

    // Si no están en Company, buscar en CompaniesSettings
    if (!appId || !appSecret) {
        console.log(`🔑 [getCompanyAccessToken] Buscando en CompaniesSettings...`);
        const settings = await CompaniesSettings.findOne({
            where: { companyId }
        });

        if (settings) {
            console.log(`🔑 [getCompanyAccessToken] CompaniesSettings encontrado - appId: ${settings.facebookAppId ? settings.facebookAppId.substring(0, 10) + '...' : 'NULL'}, appSecret: ${settings.facebookAppSecret ? 'PRESENTE' : 'NULL'}`);
            appId = appId || settings.facebookAppId;
            appSecret = appSecret || settings.facebookAppSecret;
        } else {
            console.log(`🔑 [getCompanyAccessToken] CompaniesSettings NO encontrado para company ${companyId}`);
        }
    }

    console.log(`🔑 [getCompanyAccessToken] Final - appId: ${appId ? appId.substring(0, 10) + '...' : 'NULL'}, appSecret: ${appSecret ? 'PRESENTE' : 'NULL'}`);

    if (!appId || !appSecret) {
        throw new Error(
            `Company ${companyId} does not have Facebook App credentials configured. ` +
            `Please configure facebookAppId and facebookAppSecret in company settings.`
        );
    }

    console.log(`🔑 [getCompanyAccessToken] Generando access token...`);
    return await generateAppAccessToken(appId, appSecret);
}

/**
 * Get WABA ID for a WhatsApp connection using its token
 * @param tokenMeta - Access token de Meta
 * @param phoneNumberId - (Opcional) Phone Number ID para obtener WABA directamente
 */
export async function getWABAId(tokenMeta: string, phoneNumberId?: string): Promise<string | null> {
    console.log(`🔍 [getWABAId] INICIO - Buscando WABA ID...`);
    console.log(`🔍 [getWABAId] Token recibido: ${tokenMeta ? tokenMeta.substring(0, 20) + '...' : 'NULL'}`);
    console.log(`🔍 [getWABAId] PhoneNumberId recibido: ${phoneNumberId || 'NO PROPORCIONADO'}`);

    // Método 1: Obtener WABA desde el Phone Number ID (más confiable para System User tokens)
    if (phoneNumberId) {
        console.log(`🔍 [getWABAId] Método 1: Obteniendo WABA desde /{phoneNumberId}?fields=...`);
        try {
            // Intentar obtener el account_mode o cualquier info del WABA
            const phoneResponse = await axios.get(`https://graph.facebook.com/v24.0/${phoneNumberId}`, {
                params: {
                    fields: "id,display_phone_number,verified_name,code_verification_status,quality_rating,platform_type,throughput,is_official_business_account,account_mode,is_pin_enabled,name_status,new_name_status,is_preverified_number",
                    access_token: tokenMeta
                }
            });
            console.log(`📦 [getWABAId] Respuesta del phone number:`, JSON.stringify(phoneResponse.data, null, 2));
        } catch (e: any) {
            console.warn(`⚠️ [getWABAId] Error consultando phone number:`, e.response?.data || e.message);
        }

        // Método 1b: Intentar endpoint directo de WABA desde phone number
        console.log(`🔍 [getWABAId] Método 1b: Probando /{phoneNumberId}/whatsapp_business_account...`);
        try {
            const wabaResponse = await axios.get(`https://graph.facebook.com/v24.0/${phoneNumberId}`, {
                params: {
                    fields: "whatsapp_business_account{id,name}",
                    access_token: tokenMeta
                }
            });
            console.log(`📦 [getWABAId] Respuesta:`, JSON.stringify(wabaResponse.data, null, 2));

            if (wabaResponse.data?.whatsapp_business_account?.id) {
                const wabaId = wabaResponse.data.whatsapp_business_account.id;
                console.log(`✅ [getWABAId] WABA ID encontrado: ${wabaId}`);
                return wabaId;
            }
        } catch (e: any) {
            console.warn(`⚠️ [getWABAId] Error con whatsapp_business_account:`, e.response?.data || e.message);
        }
    }

    // Método 2: debug_token para obtener info del token
    console.log(`🔍 [getWABAId] Método 2: Probando /debug_token...`);
    try {
        const debugResponse = await axios.get("https://graph.facebook.com/v24.0/debug_token", {
            params: {
                input_token: tokenMeta,
                access_token: tokenMeta
            }
        });
        console.log(`📦 [getWABAId] Respuesta de debug_token:`, JSON.stringify(debugResponse.data, null, 2));

        // Buscar WABA ID en los scopes o granular_scopes
        const data = debugResponse.data?.data;
        if (data?.granular_scopes) {
            for (const scope of data.granular_scopes) {
                if (scope.scope === "whatsapp_business_messaging" && scope.target_ids?.length > 0) {
                    // Los target_ids podrían ser WABA IDs
                    console.log(`📋 [getWABAId] WhatsApp Business target_ids encontrados:`, scope.target_ids);
                    // El primer target_id suele ser el WABA ID
                    const wabaId = scope.target_ids[0];
                    console.log(`✅ [getWABAId] WABA ID encontrado via debug_token: ${wabaId}`);
                    return wabaId;
                }
                if (scope.scope === "whatsapp_business_management" && scope.target_ids?.length > 0) {
                    console.log(`📋 [getWABAId] WhatsApp Business Management target_ids:`, scope.target_ids);
                    const wabaId = scope.target_ids[0];
                    console.log(`✅ [getWABAId] WABA ID encontrado via debug_token (management): ${wabaId}`);
                    return wabaId;
                }
            }
        }
    } catch (debugError: any) {
        console.warn(`⚠️ [getWABAId] Error con debug_token:`, debugError.response?.data || debugError.message);
    }

    // Método 3: Intentar /me con owned_whatsapp_business_accounts (para tokens de usuario)
    console.log(`🔍 [getWABAId] Método 3: Probando /me con owned_whatsapp_business_accounts...`);
    try {
        const response = await axios.get("https://graph.facebook.com/v24.0/me", {
            params: {
                fields: "id,name,owned_whatsapp_business_accounts",
                access_token: tokenMeta
            }
        });
        console.log(`📦 [getWABAId] Respuesta de /me:`, JSON.stringify(response.data, null, 2));

        const wabaAccounts = response.data.owned_whatsapp_business_accounts?.data;
        if (wabaAccounts && wabaAccounts.length > 0) {
            const wabaId = wabaAccounts[0].id;
            console.log(`✅ [getWABAId] WABA ID encontrado via /me: ${wabaId}`);
            return wabaId;
        }
    } catch (error: any) {
        console.warn(`⚠️ [getWABAId] Error con /me:`, error.response?.data || error.message);
    }

    console.warn("❌ [getWABAId] No se pudo obtener el WABA ID con ningún método");
    return null;
}

/**
 * Get channel identifier based on connection type
 */
export function getChannelIdentifier(connection: any): string {
    switch (connection.channel) {
        case "facebook":
            return connection.facebookPageUserId || "";
        case "instagram":
            return connection.facebookUserId || "";
        case "whatsapp":
            return ""; // Will be obtained via API
        default:
            return "";
    }
}

/**
 * Get action source for Conversions API based on channel
 */
export function getActionSource(channel: string): string {
    switch (channel) {
        case "whatsapp":
        case "meta":
            return "business_messaging";
        case "instagram":
        case "facebook":
            return "chat";
        default:
            return "other";
    }
}

/**
 * Get messaging channel for Conversions API
 */
export function getMessagingChannel(channel: string): "whatsapp" | "instagram" | "messenger" | undefined {
    switch (channel) {
        case "whatsapp":
        case "meta":
            return "whatsapp";
        case "instagram":
            return "instagram";
        case "facebook":
            return "messenger";
        default:
            return undefined;
    }
}
