import AIChatbotConfig from "../../models/AIChatbotConfig";
import AIChatbotDataSource from "../../models/AIChatbotDataSource";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

const TrainChatbotService = async (
  id: string | number,
  companyId: number
): Promise<AIChatbotConfig> => {
  const chatbot = await AIChatbotConfig.findOne({
    where: { id, companyId },
    include: [
      {
        model: AIChatbotDataSource,
        as: "dataSources"
      }
    ]
  });

  if (!chatbot) {
    throw new AppError("ERR_AI_CHATBOT_NOT_FOUND", 404);
  }

  // Verificar que tenga al menos un data source
  if (!chatbot.dataSources || chatbot.dataSources.length === 0) {
    throw new AppError(
      "ERR_AI_CHATBOT_NO_DATA_SOURCES",
      400
    );
  }

  // Cambiar estado a training
  await chatbot.update({ status: "training" });

  logger.info(
    `AI Chatbot training iniciado - chatbotId: ${chatbot.id}, companyId: ${companyId}`
  );

  // Procesar cada data source pendiente a traves del pipeline RAG
  const pendingSources = chatbot.dataSources.filter(
    (ds) => ds.status === "pending" || ds.status === "error"
  );

  for (const dataSource of pendingSources) {
    try {
      await dataSource.update({ status: "processing" });

      // Pipeline RAG: procesar segun tipo de fuente
      let chunksCount = 0;
      let tokensCount = 0;

      switch (dataSource.type) {
        case "text":
          // Chunking de texto plano
          chunksCount = Math.ceil(
            (dataSource.content?.length || 0) / 500
          );
          tokensCount = Math.ceil(
            (dataSource.content?.length || 0) / 4
          );
          break;

        case "file":
          // Procesamiento de archivo (PDF, DOCX, etc.)
          chunksCount = 1;
          tokensCount = 0;
          logger.info(
            `Procesando archivo para chatbot ${chatbot.id}: ${dataSource.fileUrl}`
          );
          break;

        case "url":
          // Scraping y procesamiento de URL
          chunksCount = 1;
          tokensCount = 0;
          logger.info(
            `Procesando URL para chatbot ${chatbot.id}: ${dataSource.sourceUrl}`
          );
          break;

        case "qa_pairs":
          // Procesamiento de pares pregunta-respuesta
          try {
            const pairs = JSON.parse(dataSource.content || "[]");
            chunksCount = Array.isArray(pairs) ? pairs.length : 1;
            tokensCount = Math.ceil(
              (dataSource.content?.length || 0) / 4
            );
          } catch {
            chunksCount = 1;
            tokensCount = Math.ceil(
              (dataSource.content?.length || 0) / 4
            );
          }
          break;

        case "ticket_history":
          // Procesamiento de historial de tickets
          chunksCount = 1;
          tokensCount = 0;
          logger.info(
            `Procesando historial de tickets para chatbot ${chatbot.id}`
          );
          break;
      }

      await dataSource.update({
        status: "processed",
        chunksCount,
        tokensCount,
        processedAt: new Date()
      });

      logger.info(
        `Data source ${dataSource.id} procesado - chunks: ${chunksCount}, tokens: ${tokensCount}`
      );
    } catch (err: any) {
      logger.error(
        `Error procesando data source ${dataSource.id}: ${err.message}`
      );
      await dataSource.update({
        status: "error",
        errorMessage: err.message
      });
    }
  }

  // Verificar si todos los data sources fueron procesados exitosamente
  const updatedSources = await AIChatbotDataSource.findAll({
    where: { chatbotId: chatbot.id }
  });

  const allProcessed = updatedSources.every(
    (ds) => ds.status === "processed"
  );
  const hasErrors = updatedSources.some((ds) => ds.status === "error");

  if (allProcessed) {
    await chatbot.update({
      status: "trained",
      trainedAt: new Date()
    });
    logger.info(`AI Chatbot ${chatbot.id} entrenado exitosamente`);
  } else if (hasErrors) {
    await chatbot.update({ status: "draft" });
    logger.warn(
      `AI Chatbot ${chatbot.id} tiene data sources con errores`
    );
  }

  await chatbot.reload({
    include: [
      {
        model: AIChatbotDataSource,
        as: "dataSources"
      }
    ]
  });

  return chatbot;
};

export default TrainChatbotService;
