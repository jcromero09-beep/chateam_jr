import logger from "../../utils/logger";

export interface TranscriptResult {
  videoId: string;
  title: string;
  transcript: string;
  language: string;
  durationSeconds: number;
  wordCount: number;
  summary?: string;
  latencyMs: number;
}

/**
 * Extract transcript from YouTube video
 */
const getTranscript = async (
  videoUrl: string,
  companyId: number,
  options: {
    language?: string;
    generateSummary?: boolean;
  } = {}
): Promise<TranscriptResult> => {
  const startTime = Date.now();
  const { language = 'es', generateSummary = true } = options;

  // Extract video ID from URL
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error('URL de YouTube invalida');
  }

  try {
    // Try YouTube transcript API (using youtube-transcript package pattern)
    const axios = require('axios');

    // Fetch video info via oEmbed (no API key needed)
    let title = `Video ${videoId}`;
    try {
      const infoResponse = await axios.get(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { timeout: 5000 }
      );
      title = infoResponse.data.title || title;
    } catch { /* ignore */ }

    // Fetch transcript via Innertube API
    let transcript = '';
    let durationSeconds = 0;

    try {
      // Use timedtext API
      const captionResponse = await axios.get(
        `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${language}&fmt=srv3`,
        { timeout: 10000 }
      );

      if (captionResponse.data) {
        // Parse XML-like response to extract text
        const textMatches = captionResponse.data.match(/<text[^>]*>(.*?)<\/text>/gs) || [];
        transcript = textMatches
          .map((match: string) => match.replace(/<[^>]+>/g, '').trim())
          .filter((t: string) => t.length > 0)
          .join(' ');

        // Estimate duration from last caption
        const durMatches = captionResponse.data.match(/dur="([\d.]+)"/g);
        if (durMatches && durMatches.length > 0) {
          const lastDur = durMatches[durMatches.length - 1].match(/[\d.]+/);
          durationSeconds = Math.ceil(parseFloat(lastDur?.[0] || '0'));
        }
      }
    } catch (captionError: any) {
      logger.warn(`[YouTubeTranscript] Caption fetch failed for ${videoId}: ${captionError.message}`);
      // Fallback: use Whisper if audio is accessible
      transcript = `[Transcripcion no disponible para ${videoId}. El video puede no tener subtitulos.]`;
    }

    // Generate summary if requested
    let summary: string | undefined;
    if (generateSummary && transcript.length > 200) {
      try {
        const AIClientService = require("../AIClientService").default;
        const response = await AIClientService.generateText({
          prompt: `Resume la siguiente transcripcion de YouTube en maximo 200 palabras.
Incluye los puntos clave.

Titulo: ${title}
Transcripcion: ${transcript.substring(0, 4000)}

Resumen:`,
          modelKey: 'gpt-4.1-mini',
          maxTokens: 300,
          temperature: 0.3
        });
        summary = response.text;
      } catch { /* ignore summary errors */ }
    }

    logger.info(`[YouTubeTranscript] Extracted: ${videoId}, ${transcript.length} chars, empresa=${companyId}`);

    return {
      videoId,
      title,
      transcript,
      language,
      durationSeconds,
      wordCount: transcript.split(/\s+/).length,
      summary,
      latencyMs: Date.now() - startTime
    };
  } catch (error: any) {
    logger.error(`[YouTubeTranscript] Error for ${videoId}: ${error.message}`);
    throw error;
  }
};

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export default { getTranscript };
