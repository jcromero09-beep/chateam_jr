import fs from "fs";
import { chatCompletion } from "../../AIClientService";

export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.trim().split(/\s+/).length * 1.3); // estimacion basica: 1.3 tokens por palabra
};

export const deleteFileSync = (path: string): void => {
  try {
    fs.unlinkSync(path);
  } catch (error) {
    console.error("Erro ao deletar o arquivo:", error);
  }
};

export const sanitizeName = (name: string): string => {
  let sanitized = name.split(" ")[0];
  sanitized = sanitized.replace(/[^a-zA-Z0-9]/g, "");
  return sanitized.substring(0, 60);
};

// MIGRADO: Wrapper sobre chatCompletion de AIClientService
// Mantiene formato compatible con codigo existente (choices[0].message.content)
export async function getSafeCompletion(
  basePayload: any,
  companyId?: number,
  module: 'chat' | 'followup' | 'classification' | 'embedding' | 'whisper' | 'transfer' | 'file_processing' = 'chat'
): Promise<any> {
  try {
    const response = await chatCompletion({
      messages: basePayload.messages,
      maxTokens: basePayload.max_tokens,
      // CAP de temperature: para chat de atención al cliente, máximo 0.2
      // Esto evita que el LLM invente datos cuando no tiene contexto
      temperature: module === 'chat'
        ? Math.min(basePayload.temperature || 0.7, 0.2)
        : (basePayload.temperature || 0.7),
      companyId,
      module
    });

    // Devolver formato compatible con OpenAI SDK
    return {
      choices: [{
        message: {
          content: response.content,
          role: 'assistant'
        }
      }],
      usage: response.usage,
      model: response.model
    };
  } catch (err: any) {
    console.error(`Error en getSafeCompletion:`, err);
    throw err;
  }
}
