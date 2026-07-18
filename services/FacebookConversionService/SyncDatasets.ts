import Company from "../../models/Company";
import Whatsapp from "../../models/Whatsapp";
import FacebookDataset from "../../models/FacebookDataset";
import { GRAPH_API_VERSION } from "../../config/metaGraph"; // [Fase2·A2.1] fuente única versión
import CompaniesSettings from "../../models/CompaniesSettings";
import { MetaMarketing } from "../../meta-marketing/src";
import {
    getCompanyAccessToken,
    getWABAId
} from "./FacebookAuthHelper";

type DatasetSyncMode = "auto";

interface SyncDatasetForConnectionOptions {
    mode?: DatasetSyncMode;
    datasetName?: string;
}

const SUPPORTED_CHANNELS = ["facebook", "instagram", "whatsapp", "meta"];

const getChannelLabel = (channel?: string): string => {
    switch ((channel || "").toLowerCase()) {
        case "facebook":
            return "Facebook";
        case "instagram":
            return "Instagram";
        case "meta":
            return "Meta";
        case "whatsapp":
            return "WhatsApp";
        default:
            return channel || "Canal";
    }
};

const buildDefaultDatasetName = (company: Company, connection: Whatsapp): string => {
    const companyName = (company.name || `Company ${company.id}`).trim();
    const connectionName = (connection.name || `Conexion ${connection.id}`).trim();
    return `Chateam - ${companyName} - ${connectionName} - ${getChannelLabel(connection.channel)}`;
};

const getConnectionIdentifier = async (connection: Whatsapp): Promise<string> => {
    if (connection.channel === "facebook") {
        if (!connection.facebookPageUserId) {
            throw new Error("Facebook connection missing facebookPageUserId");
        }
        return String(connection.facebookPageUserId).trim();
    }

    if (connection.channel === "instagram") {
        if (!connection.facebookUserId) {
            throw new Error("Instagram connection missing facebookUserId");
        }
        return String(connection.facebookUserId).trim();
    }

    if (connection.channel === "whatsapp" || connection.channel === "meta") {
        const explicitWaba = String(connection.facebookUserId || "").trim();
        if (/^\d{8,30}$/.test(explicitWaba)) return explicitWaba;

        if (!connection.tokenMeta) {
            throw new Error(`${connection.channel} connection missing tokenMeta (System User Token required)`);
        }

        const wabaId = await getWABAId(connection.tokenMeta, connection.phoneNumberId);
        if (!wabaId) {
            throw new Error("Could not retrieve WABA ID for WhatsApp connection");
        }

        return String(wabaId).trim();
    }

    throw new Error(`Unsupported channel type: ${connection.channel}`);
};

const getClientForConnection = async (
    companyId: number,
    connection: Whatsapp,
    appClient?: MetaMarketing
): Promise<MetaMarketing> => {
    const settings = await CompaniesSettings.findOne({ where: { companyId } });
    const systemToken = settings?.facebookSystemUserToken;
    const connectionToken = connection.tokenMeta;

    if ((connection.channel === "whatsapp" || connection.channel === "meta") && (connectionToken || systemToken)) {
        return new MetaMarketing({
            accessToken: connectionToken || systemToken!,
            apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION
        });
    }

    if (systemToken) {
        return new MetaMarketing({
            accessToken: systemToken,
            apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION
        });
    }

    if (appClient) return appClient;

    const accessToken = await getCompanyAccessToken(companyId);
    return new MetaMarketing({
        accessToken,
        apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION
    });
};

/**
 * Sync Facebook datasets for companies with social media connections
 * Supports Facebook Pages, Instagram accounts, and WhatsApp Business
 * @param companyId - Optional: If provided, only sync for this company
 */
const SyncDatasets = async (companyId?: number): Promise<{
    synced: number;
    created: number;
    errors: string[];
}> => {
    console.log(`🔄 [SyncDatasets] INICIO - companyId: ${companyId || 'ALL'}`);

    // DEBUG: Verificar company específica
    if (companyId) {
        console.log(`🔍 [SyncDatasets] DEBUG Company ${companyId} - Iniciando diagnóstico...`);
        const companyDebug = await Company.findByPk(companyId, {
            include: [{
                model: Whatsapp,
                as: "whatsapps"
            }]
        });
        if (companyDebug) {
            console.log(`🔍 [SyncDatasets] DEBUG Company ${companyId}:`, JSON.stringify({
                id: companyDebug.id,
                name: companyDebug.name,
                facebookAppId: companyDebug.facebookAppId ? 'PRESENTE' : 'NULL',
                facebookAppSecret: companyDebug.facebookAppSecret ? 'PRESENTE' : 'NULL',
                totalWhatsapps: companyDebug.whatsapps?.length || 0,
                whatsapps: companyDebug.whatsapps?.map(w => ({
                    id: w.id,
                    name: w.name,
                    channel: w.channel,
                    status: w.status,
                    facebookPageUserId: w.facebookPageUserId || 'NULL',
                    facebookUserId: w.facebookUserId || 'NULL',
                    phoneNumberId: w.phoneNumberId || 'NULL',
                    tokenMeta: w.tokenMeta ? 'PRESENTE' : 'NULL'
                }))
            }, null, 2));
        } else {
            console.log(`🔍 [SyncDatasets] DEBUG Company ${companyId}: NO ENCONTRADA`);
        }
    }

    // Build query - filter by companyId if provided
    const whereClause: any = {};
    if (companyId) {
        whereClause.id = companyId;
    }

    // Get companies with social media connections
    const companies = await Company.findAll({
        where: whereClause,
        include: [
            {
                model: Whatsapp,
                as: "whatsapps",
                where: {
                    channel: SUPPORTED_CHANNELS
                },
                required: true
            }
        ]
    });

    console.log(`📋 [SyncDatasets] Encontradas ${companies.length} compañías con conexiones sociales`);

    // DEBUG: Si no hay companies, mostrar qué conexiones existen en la company
    if (companies.length === 0 && companyId) {
        console.log(`⚠️ [SyncDatasets] NO se encontraron conexiones sociales para company ${companyId}`);
        console.log(`🔍 [SyncDatasets] Verificando todas las conexiones de WhatsApp para company ${companyId}...`);
        const allConnections = await Whatsapp.findAll({
            where: { companyId }
        });
        console.log(`🔍 [SyncDatasets] Total de conexiones WhatsApp en company ${companyId}: ${allConnections.length}`);
        if (allConnections.length > 0) {
            console.log(`🔍 [SyncDatasets] Canales encontrados:`, allConnections.map(c => c.channel));
            console.log(`⚠️ [SyncDatasets] El servicio solo busca canales: facebook, instagram, whatsapp, meta`);
        } else {
            console.log(`⚠️ [SyncDatasets] La company ${companyId} NO tiene ninguna conexión de WhatsApp`);
        }
    }

    let synced = 0;
    let created = 0;
    const errors: string[] = [];

    for (const company of companies) {
        console.log(`\n🏢 [SyncDatasets] Procesando Company: ${company.name} (ID: ${company.id})`);
        console.log(`📱 [SyncDatasets] Conexiones: ${company.whatsapps?.length || 0}`);

        try {
            // Get access token for this company
            console.log(`🔑 [SyncDatasets] Obteniendo access token para company ${company.id}...`);
            const accessToken = await getCompanyAccessToken(company.id);
            console.log(`✅ [SyncDatasets] Access token obtenido: ${accessToken.substring(0, 20)}...`);

            const metaClient = new MetaMarketing({
                accessToken,
                apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION
            });

            for (const connection of company.whatsapps) {
                console.log(`\n  📞 [SyncDatasets] Procesando conexión: ${connection.name} (ID: ${connection.id})`);
                console.log(`  📞 [SyncDatasets] Canal: ${connection.channel}`);
                console.log(`  📞 [SyncDatasets] facebookPageUserId: ${connection.facebookPageUserId || 'NULL'}`);
                console.log(`  📞 [SyncDatasets] facebookUserId: ${connection.facebookUserId || 'NULL'}`);
                console.log(`  📞 [SyncDatasets] tokenMeta: ${connection.tokenMeta ? connection.tokenMeta.substring(0, 20) + '...' : 'NULL'}`);

                try {
                    // Check if dataset already exists
                    let dataset = await FacebookDataset.findOne({
                        where: {
                            companyId: company.id,
                            whatsappId: connection.id
                        }
                    });

                    if (dataset) {
                        console.log("  ⏭️ [SyncDatasets] Dataset ya existe (ID: " + dataset.id + ", datasetId: " + dataset.datasetId + ")");

                        const metadataPatch: any = {};
                        if (!(dataset as any).datasetName) {
                            metadataPatch.datasetName = buildDefaultDatasetName(company, connection);
                        }
                        if (!(dataset as any).datasetSource) {
                            metadataPatch.datasetSource = "legacy";
                        }
                        if (!(dataset as any).validationStatus) {
                            metadataPatch.validationStatus = "pending";
                        }

                        if (connection.channel === "whatsapp" || connection.channel === "meta") {
                            const connectionWabaId = String(connection.facebookUserId || "").trim();
                            const hasNumericWaba = /^\d{8,30}$/.test(connectionWabaId);
                            const datasetWabaId = String(dataset.channelIdentifier || dataset.channelSpecificId || "").trim();

                            if (!datasetWabaId && hasNumericWaba) {
                                Object.assign(metadataPatch, {
                                  channelIdentifier: connectionWabaId,
                                  channelSpecificId: connectionWabaId,
                                  channel: connection.channel,
                                  status: "active"
                                });
                                console.log("  🔧 [SyncDatasets] Dataset existente actualizado con WABA ID: " + connectionWabaId);
                            } else if (!datasetWabaId && connectionWabaId && !hasNumericWaba) {
                                const errMsg = connection.channel + " connection " + connection.id + " (" + connection.name + ") has invalid facebookUserId for WABA ID: " + connectionWabaId + ". Use numeric WhatsApp Business Account ID.";
                                console.error("  ❌ [SyncDatasets] " + errMsg);
                                errors.push(errMsg);
                            }
                        }

                        if (Object.keys(metadataPatch).length) {
                            await dataset.update(metadataPatch);
                        }

                        synced++;
                        continue;
                    }

                    console.log(`  🆕 [SyncDatasets] No existe dataset, creando uno nuevo...`);

                    let channelIdentifier = "";
                    let datasetId = "";

                    // Handle different channel types
                    if (connection.channel === "facebook") {
                        // Facebook Page
                        channelIdentifier = connection.facebookPageUserId;
                        console.log(`  📘 [SyncDatasets] Canal Facebook - facebookPageUserId: ${channelIdentifier || 'NULL'}`);

                        if (!channelIdentifier) {
                            const errMsg = `Facebook connection ${connection.id} (${connection.name}) missing facebookPageUserId`;
                            console.error(`  ❌ [SyncDatasets] ${errMsg}`);
                            errors.push(errMsg);
                            continue;
                        }

                        // Get or create dataset for Facebook Page
                        console.log(`  🔄 [SyncDatasets] Llamando a getOrCreateDataset(${channelIdentifier})...`);
                        datasetId = await metaClient.conversions.getOrCreateDataset(channelIdentifier, {
                            name: buildDefaultDatasetName(company, connection)
                        });
                        console.log(`  ✅ [SyncDatasets] Dataset obtenido: ${datasetId}`);

                    } else if (connection.channel === "instagram") {
                        // Instagram Account
                        channelIdentifier = connection.facebookUserId;
                        console.log(`  📷 [SyncDatasets] Canal Instagram - facebookUserId: ${channelIdentifier || 'NULL'}`);

                        if (!channelIdentifier) {
                            const errMsg = `Instagram connection ${connection.id} (${connection.name}) missing facebookUserId`;
                            console.error(`  ❌ [SyncDatasets] ${errMsg}`);
                            errors.push(errMsg);
                            continue;
                        }

                        // Get or create dataset for Instagram Account
                        console.log(`  🔄 [SyncDatasets] Llamando a getOrCreateDataset(${channelIdentifier})...`);
                        datasetId = await metaClient.conversions.getOrCreateDataset(channelIdentifier, {
                            name: buildDefaultDatasetName(company, connection)
                        });
                        console.log(`  ✅ [SyncDatasets] Dataset obtenido: ${datasetId}`);

                    } else if (connection.channel === "whatsapp" || connection.channel === "meta") {
                        // WhatsApp Business or Meta connection
                        console.log(`  📲 [SyncDatasets] Canal ${connection.channel}`);
                        console.log(`  📲 [SyncDatasets] phoneNumberId: ${connection.phoneNumberId || 'NULL'}`);
                        console.log(`  📲 [SyncDatasets] facebookUserId (WABA ID): ${connection.facebookUserId || 'NULL'}`);
                        console.log(`  📲 [SyncDatasets] tokenMeta: ${connection.tokenMeta ? 'PRESENTE' : 'NULL'}`);

                        if (!connection.tokenMeta) {
                            const errMsg = `${connection.channel} connection ${connection.id} (${connection.name}) missing tokenMeta (System User Token required)`;
                            console.error(`  ❌ [SyncDatasets] ${errMsg}`);
                            errors.push(errMsg);
                            continue;
                        }

                        // El WABA ID debe estar guardado en facebookUserId
                        // (confirmado: facebookUserId = WABA ID para conexiones WhatsApp/Meta)
                        if (!connection.facebookUserId) {
                            const errMsg = `${connection.channel} connection ${connection.id} (${connection.name}) missing facebookUserId (WABA ID). Configure el WABA ID en la conexión.`;
                            console.error(`  ❌ [SyncDatasets] ${errMsg}`);
                            errors.push(errMsg);
                            continue;
                        }

                        const wabaId = String(connection.facebookUserId).trim();
                        if (!/^\d{8,30}$/.test(wabaId)) {
                            const errMsg = connection.channel + " connection " + connection.id + " (" + connection.name + ") has invalid facebookUserId for WABA ID: " + wabaId + ". Use numeric WhatsApp Business Account ID.";
                            console.error("  ❌ [SyncDatasets] " + errMsg);
                            errors.push(errMsg);
                            continue;
                        }
                        console.log("  ✅ [SyncDatasets] WABA ID a usar: " + wabaId);
                        channelIdentifier = wabaId;

                        // Para WhatsApp/Meta, usar el tokenMeta (System User Token) en lugar del App Access Token
                        // El App Access Token no tiene permisos para datasets de WhatsApp
                        console.log(`  🔑 [SyncDatasets] Creando cliente Meta con tokenMeta (System User Token)...`);
                        const whatsappClient = new MetaMarketing({
                            accessToken: connection.tokenMeta,
                            apiVersion: process.env.FACEBOOK_CONVERSIONS_API_VERSION || GRAPH_API_VERSION
                        });

                        // Get or create dataset for WABA usando el System User Token
                        console.log(`  🔄 [SyncDatasets] Llamando a getOrCreateDataset(${wabaId}) con System User Token...`);
                        datasetId = await whatsappClient.conversions.getOrCreateDataset(wabaId, {
                            name: buildDefaultDatasetName(company, connection)
                        });
                        console.log(`  ✅ [SyncDatasets] Dataset obtenido: ${datasetId}`);
                    }

                    // Save dataset to database
                    console.log(`  💾 [SyncDatasets] Guardando dataset en BD...`);
                    dataset = await FacebookDataset.create({
                        companyId: company.id,
                        whatsappId: connection.id,
                        datasetId: datasetId,
                        datasetName: buildDefaultDatasetName(company, connection),
                        datasetSource: "auto",
                        validationStatus: "valid",
                        validationError: null,
                        validatedAt: new Date(),
                        channel: connection.channel,
                        channelIdentifier: channelIdentifier,
                        channelSpecificId: channelIdentifier,
                        status: "active"
                    });

                    created++;
                    console.log(
                        `  ✅ [SyncDatasets] Dataset creado con éxito! ID: ${dataset.id}, datasetId: ${datasetId}`
                    );

                } catch (error: any) {
                    const errorMsg = `Error syncing dataset for ${connection.channel} ${connection.name} (ID: ${connection.id}): ${error.message}`;
                    errors.push(errorMsg);
                    console.error(`  ❌ [SyncDatasets] ${errorMsg}`);
                    console.error(`  ❌ [SyncDatasets] Stack: ${error.stack}`);
                }
            }
        } catch (error: any) {
            const errorMsg = `Error syncing datasets for company ${company.name} (ID: ${company.id}): ${error.message}`;
            errors.push(errorMsg);
            console.error(`❌ [SyncDatasets] ${errorMsg}`);
            console.error(`❌ [SyncDatasets] Stack: ${error.stack}`);
        }
    }

    console.log(`\n🏁 [SyncDatasets] COMPLETADO - Synced: ${synced}, Created: ${created}, Errors: ${errors.length}`);
    if (errors.length > 0) {
        console.log(`📋 [SyncDatasets] Errores:`, errors);
    }

    return {
        synced,
        created,
        errors
    };
};

/**
 * Sync dataset for a specific connection (Facebook/Instagram/WhatsApp)
 */
export const SyncDatasetForConnection = async (
    companyId: number,
    whatsappId: number,
    options: SyncDatasetForConnectionOptions = {}
): Promise<FacebookDataset> => {
    const mode: DatasetSyncMode = "auto";

    const company = await Company.findByPk(companyId);
    if (!company) {
        throw new Error(`Company ${companyId} not found`);
    }

    // Get connection
    const connection = await Whatsapp.findOne({
        where: { id: whatsappId, companyId }
    });
    if (!connection) {
        throw new Error(`Connection ${whatsappId} not found for company ${companyId}`);
    }

    if (!SUPPORTED_CHANNELS.includes(connection.channel)) {
        throw new Error(`Unsupported channel type: ${connection.channel}`);
    }

    let dataset = await FacebookDataset.findOne({
        where: {
            companyId,
            whatsappId
        }
    });

    if (dataset && !options.datasetName && options.mode !== "auto") {
        return dataset;
    }

    const channelIdentifier = await getConnectionIdentifier(connection);
    const metaClient = await getClientForConnection(companyId, connection);
    const requestedName = String(options.datasetName || "").trim();
    const datasetName = requestedName || buildDefaultDatasetName(company, connection);

    let datasetId = "";
    let resolvedDatasetName = datasetName;
    const now = new Date();

    datasetId = await metaClient.conversions.getOrCreateDataset(channelIdentifier, {
        name: datasetName
    });

    try {
        const details = await metaClient.conversions.getDatasetDetails(datasetId);
        resolvedDatasetName = details.name || datasetName;
    } catch (error: any) {
        console.warn(
            `⚠️ [SyncDatasetForConnection] Dataset ${datasetId} creado/obtenido, pero no se pudo leer nombre: ${error.message}`
        );
    }

    const payload: any = {
        companyId,
        whatsappId,
        datasetId,
        datasetName: resolvedDatasetName,
        datasetSource: mode,
        validationStatus: "valid",
        validationError: null,
        validatedAt: now,
        channel: connection.channel,
        channelIdentifier,
        channelSpecificId: channelIdentifier,
        status: "active"
    };

    if (dataset) {
        await dataset.update(payload);
    } else {
        dataset = await FacebookDataset.create(payload);
    }

    return dataset;
};

export default SyncDatasets;
