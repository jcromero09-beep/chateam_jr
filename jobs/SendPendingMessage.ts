import { Job } from "bull";
import logger from "../utils/logger";
import SendPendingMessagesService from "../services/MessageServices/SendPendingMessagesService";

interface SendPendingMessageData {
  messageId: number;
}

export default {
  key: "SendPendingMessage",

  async handle({ data }: Job<SendPendingMessageData>) {
    const { messageId } = data;

    try {
      await SendPendingMessagesService({ messageId });
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      logger.error(`[SendPendingMessage] Error processing job: ${errorMessage}`);
      throw error;
    }
  }
};
