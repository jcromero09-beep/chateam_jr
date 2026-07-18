import { MessageUpsertType, proto, WASocket } from "baileys";
import OpenAI from "openai";

// ==================== Tipos de sesion ====================

export type Session = WASocket & {
  id?: number;
};

export interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

export interface IMe {
  name: string;
  id: string;
}

export interface SessionOpenAi extends OpenAI {
  id?: number;
  lastUsed?: number;
}

export interface IOpenAi {
  id?: number;
  name: string;
  prompt: string;
  voice: string;
  voiceKey: string;
  voiceRegion: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  queueId: number;
  maxMessages: number;
  fileNameIA?: string;
  queues?: Array<{ id: number; name: string; promptAI?: string }>;
}

// Interface para la respuesta de clasificacion de queue
export interface QueueClassificationResult {
  shouldAssignQueue: boolean;
  queueId: number | null;
  queueName: string | null;
  confidence: number;
  reason: string;
}

// ==================== Pool de sesiones OpenAI ====================

export const sessionsOpenAi: SessionOpenAi[] = [];

// Limpieza automatica de sesiones OpenAI cada 10 minutos
setInterval(() => {
  const unaHora = 1000 * 60 * 60;
  const ahora = Date.now();
  const antes = sessionsOpenAi.length;

  for (let i = sessionsOpenAi.length - 1; i >= 0; i--) {
    const sesion = sessionsOpenAi[i];
    if (!sesion.lastUsed || ahora - sesion.lastUsed > unaHora) {
      sessionsOpenAi.splice(i, 1);
    }
  }

  const despues = sessionsOpenAi.length;
  if (antes !== despues) {
  }
}, 1000 * 60 * 10); // cada 10 minutos
