import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Prompt from "../../models/Prompt";
import PromptQueue from "../../models/PromptQueue";
import Queue from "../../models/Queue";
import ShowPromptService from "./ShowPromptService";
import path from 'path';
import { procesarArchivoYEmbeddings } from "../IntegrationsServices/procesarArchivoYEmbeddings";

interface PromptData {
    name: string;
    apiKey?: string; // Opcional - legacy, usar aiProviderId en su lugar
    aiProviderId?: number; // ID del proveedor de IA configurado
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    queueId?: number;
    queueIds?: number[];
    maxMessages?: number;
    companyId: string | number;
    voice?: string;
    voiceKey?: string;
    voiceRegion?: string;
    fileNameIA?: string;
}

const CreatePromptService = async (promptData: PromptData): Promise<Prompt> => {
    const {
        name,
        apiKey,
        aiProviderId,
        prompt,
        queueId,
        queueIds,
        maxMessages,
        companyId,
        fileNameIA
    } = promptData;

    console.log('[DEBUG] Iniciando creación de prompt con datos:', {
        name,
        queueId,
        queueIds,
        companyId,
        aiProviderId,
        hasFile: !!fileNameIA
    });

    // Validación de datos del prompt (sin aiProviderId)
    const promptSchema = Yup.object().shape({
        name: Yup.string().required("ERR_PROMPT_NAME_INVALID"),
        prompt: Yup.string().required("ERR_PROMPT_INTELLIGENCE_INVALID"),
        apiKey: Yup.string().notRequired(),
        aiProviderId: Yup.number().notRequired(), // Opcional - no se usa
        queueId: Yup.number().notRequired(),
        queueIds: Yup.array().of(Yup.number()).notRequired(),
        maxMessages: Yup.number().required("ERR_PROMPT_MAX_MESSAGES_INVALID"),
        companyId: Yup.number().required("ERR_PROMPT_companyId_INVALID"),
        fileNameIA: Yup.string().notRequired()
    });

    try {
        console.log('[DEBUG] Validando datos del prompt...');
        await promptSchema.validate({ name, apiKey, aiProviderId, prompt, queueId, queueIds, maxMessages, companyId, fileNameIA });
        console.log('[DEBUG] Validación de datos exitosa');
    } catch (err) {
        console.error('[ERROR] Validación fallida:', err);
        throw new AppError(`${JSON.stringify(err, undefined, 2)}`);
    }

    // Validar que todos los queueIds pertenecen a la compañía (si se proporcionan)
    if (queueIds && queueIds.length > 0) {
        console.log('[DEBUG] Validando queueIds:', queueIds);
        const queues = await Queue.findAll({
            where: {
                id: queueIds,
                companyId: Number(companyId)
            }
        });

        if (queues.length !== queueIds.length) {
            console.error('[ERROR] Uno o más queueIds no pertenecen a la compañía');
            throw new AppError("ERR_INVALID_QUEUE_IDS");
        }
        console.log('[DEBUG] Todos los queueIds validados exitosamente');
    }

    // Validar queueId individual si se proporciona
    if (queueId && queueId !== 0) {
        console.log('[DEBUG] Validando queueId:', queueId);
        const queue = await Queue.findOne({
            where: {
                id: queueId,
                companyId: Number(companyId)
            }
        });

        if (!queue) {
            console.error('[ERROR] queueId no pertenece a la compañía');
            throw new AppError("ERR_INVALID_QUEUE_ID");
        }
        console.log('[DEBUG] queueId validado exitosamente');
    }

    // Gestión de directorios si hay archivo
    if (fileNameIA) {
        console.log('[DEBUG] Procesando archivo adjunto:', fileNameIA);
    
    } else {
        console.log('[DEBUG] No se recibió archivo adjunto');
    }

    // Crear el prompt en la base de datos
    console.log('[DEBUG] Creando registro en la base de datos...');
    try {
        // Set default value for voice if not provided
        const promptDataWithDefaults: any = {
            ...promptData,
            voice: promptData.voice || "text",
            companyId: Number(promptData.companyId),
            queueId: promptData.queueId && promptData.queueId !== 0 ? promptData.queueId : null
        };

        let promptTable = await Prompt.create(promptDataWithDefaults);
        console.log('[DEBUG] Registro creado con ID:', promptTable.id);

        // Crear relaciones con múltiples queues si se proporcionan queueIds
        if (queueIds && queueIds.length > 0) {
            console.log('[DEBUG] Creando relaciones con queues:', queueIds);
            const promptQueuePromises = queueIds.map(qId =>
                PromptQueue.create({
                    promptId: promptTable.id,
                    queueId: qId
                })
            );
            await Promise.all(promptQueuePromises);
            console.log('[DEBUG] Relaciones con queues creadas exitosamente');
        }

        promptTable = await ShowPromptService({ promptId: promptTable.id, companyId });
        console.log('[DEBUG] Prompt recuperado para respuesta');
// 👇 Embedding asincrónico antes del return
if (fileNameIA) {
    console.log('[DEBUG] Iniciando proceso de embedding asincrónico...');
  
    const rutaDelArchivo = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      `file${companyId}`,
      fileNameIA
    );
  
    setImmediate(() => {
      procesarArchivoYEmbeddings(rutaDelArchivo, { companyId: Number(companyId) })
        .then(() => console.log("✅ Embedding generado con éxito"))
        .catch(err => console.error("❌ Error al generar embedding:", err));
    });
  }
  

        return promptTable;
    } catch (err) {
        console.error('[ERROR] Error al crear el prompt:', err);
        throw err;
    }
  
};

export default CreatePromptService;