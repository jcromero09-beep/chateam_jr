import { Request, Response } from "express";
import RealtimeAudioService from "../services/AIRealtimeAudioServices/RealtimeAudioService";
import ElevenLabsTTSService from "../services/AIRealtimeAudioServices/ElevenLabsTTSService";
import AppError from "../errors/AppError";

// POST /ai/audio/process — Procesar audio (nota de voz)
export const processAudio = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { audioBase64, ticketId, contactId, generateAudioResponse, voice } = req.body;

  if (!audioBase64) {
    throw new AppError("ERR_AUDIO_REQUIRED", 400);
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");

  const result = await RealtimeAudioService.processAudioMessage(
    audioBuffer,
    companyId,
    {
      ticketId,
      contactId,
      generateAudioResponse: generateAudioResponse !== false,
      voice
    }
  );

  return res.json({ success: true, data: result });
};

// POST /ai/audio/tts — Text-to-Speech con ElevenLabs
export const textToSpeech = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { text, voiceId, provider } = req.body;

  if (!text) {
    throw new AppError("ERR_TEXT_REQUIRED", 400);
  }

  let result;
  if (provider === "elevenlabs") {
    result = await ElevenLabsTTSService.generateSpeech(text, companyId, { voiceId });
  } else {
    // Default: OpenAI TTS via RealtimeAudioService (internal)
    result = await ElevenLabsTTSService.generateSpeech(text, companyId);
  }

  return res.json({ success: true, data: result });
};

// GET /ai/audio/voices — Listar voces disponibles
export const listVoices = async (req: Request, res: Response): Promise<Response> => {
  const openaiVoices = RealtimeAudioService.getAvailableVoices();
  const elevenLabsVoices = ElevenLabsTTSService.getVoices();

  return res.json({
    success: true,
    data: {
      openai: openaiVoices,
      elevenlabs: elevenLabsVoices
    }
  });
};

// GET /ai/audio/status — Estado de servicios de audio
export const getStatus = async (req: Request, res: Response): Promise<Response> => {
  const elevenLabsStatus = await ElevenLabsTTSService.checkStatus();

  return res.json({
    success: true,
    data: {
      openai: { isAvailable: !!process.env.OPENAI_API_KEY },
      elevenlabs: elevenLabsStatus
    }
  });
};
