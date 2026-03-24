import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { getApiKeyWithFallback } from "../AIProviderService";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface CreateVideoData {
  text: string;
  avatarId?: string;
  voiceId?: string;
  background?: string;
}

interface CreateVideoResult {
  videoId: string;
  status: string;
}

interface VideoStatusResult {
  status: string;
  videoUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
}

interface AvatarInfo {
  avatarId: string;
  name: string;
  preview: string;
}

interface VoiceInfo {
  voiceId: string;
  name: string;
  language: string;
  gender: string;
  preview: string;
}

interface QuotaInfo {
  remaining: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getApiKey = async (): Promise<string> => {
  return getApiKeyWithFallback('heygen', 'HEYGEN_API_KEY');
};

const heygenFetch = async <T>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  const apiKey = await getApiKey();

  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(
      { url, status: response.status, body: errorBody },
      "[Heygen] Error en request a API"
    );
    throw new AppError(
      `ERR_HEYGEN_API_${response.status}: ${errorBody}`,
      response.status
    );
  }

  const data = await response.json() as T;
  return data;
};

// ---------------------------------------------------------------------------
// Funciones del servicio
// ---------------------------------------------------------------------------

/**
 * Crear un video con avatar Heygen.
 */
const createVideo = async (
  companyId: number,
  data: CreateVideoData
): Promise<CreateVideoResult> => {
  if (!data.text || data.text.trim().length === 0) {
    throw new AppError("ERR_HEYGEN_TEXT_REQUIRED", 400);
  }

  const payload = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: data.avatarId || "default"
        },
        voice: {
          type: "text",
          input_text: data.text,
          voice_id: data.voiceId || "default"
        },
        background: {
          type: "color",
          value: data.background || "#ffffff"
        }
      }
    ],
    dimension: {
      width: 1280,
      height: 720
    }
  };

  logger.info(
    { companyId, textLength: data.text.length, avatarId: data.avatarId },
    "[Heygen] Creando video"
  );

  const result = await heygenFetch<{
    data: { video_id: string; status: string };
  }>("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    body: JSON.stringify(payload)
  });

  logger.info(
    { companyId, videoId: result.data.video_id },
    "[Heygen] Video creado exitosamente"
  );

  return {
    videoId: result.data.video_id,
    status: result.data.status
  };
};

/**
 * Consultar el estado de un video.
 */
const getVideoStatus = async (
  videoId: string
): Promise<VideoStatusResult> => {
  if (!videoId) {
    throw new AppError("ERR_HEYGEN_VIDEO_ID_REQUIRED", 400);
  }

  const result = await heygenFetch<{
    data: {
      status: string;
      video_url?: string;
      duration?: number;
      thumbnail_url?: string;
    };
  }>(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    method: "GET"
  });

  return {
    status: result.data.status,
    videoUrl: result.data.video_url,
    duration: result.data.duration,
    thumbnailUrl: result.data.thumbnail_url
  };
};

/**
 * Listar avatares disponibles.
 */
const listAvatars = async (): Promise<AvatarInfo[]> => {
  const result = await heygenFetch<{
    data: {
      avatars: Array<{
        avatar_id: string;
        avatar_name: string;
        preview_image_url?: string;
      }>;
    };
  }>("https://api.heygen.com/v2/avatars", {
    method: "GET"
  });

  return (result.data.avatars || []).map(avatar => ({
    avatarId: avatar.avatar_id,
    name: avatar.avatar_name,
    preview: avatar.preview_image_url || ""
  }));
};

/**
 * Listar voces disponibles.
 */
const listVoices = async (): Promise<VoiceInfo[]> => {
  const result = await heygenFetch<{
    data: {
      voices: Array<{
        voice_id: string;
        name?: string;
        display_name?: string;
        language: string;
        gender: string;
        preview_audio?: string;
      }>;
    };
  }>("https://api.heygen.com/v2/voices", {
    method: "GET"
  });

  return (result.data.voices || []).map(voice => ({
    voiceId: voice.voice_id,
    name: voice.display_name || voice.name || voice.voice_id,
    language: voice.language,
    gender: voice.gender,
    preview: voice.preview_audio || ""
  }));
};

/**
 * Consultar cuota restante de la cuenta Heygen.
 */
const getQuota = async (): Promise<QuotaInfo> => {
  const result = await heygenFetch<{
    data: {
      remaining_quota: number;
      total_quota?: number;
    };
  }>("https://api.heygen.com/v2/user/remaining_quota", {
    method: "GET"
  });

  return {
    remaining: result.data.remaining_quota,
    total: result.data.total_quota || 0
  };
};

export default {
  createVideo,
  getVideoStatus,
  listAvatars,
  listVoices,
  getQuota
};
