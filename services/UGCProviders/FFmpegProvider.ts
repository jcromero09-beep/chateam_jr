/**
 * FFmpegProvider — Composicion de video local con FFmpeg.
 * Todas las operaciones usan child_process.spawn (NO exec) para evitar
 * inyeccion de comandos. Cada funcion valida las rutas de entrada.
 */

import { spawn } from "child_process";
import { access, constants } from "fs/promises";
import path from "path";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  codec: string;
  size: number;
  bitrate: number;
  fps: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verifica que ffmpeg o ffprobe esten instalados y accesibles.
 */
async function verifyBinaryExists(binary: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("which", [binary]);
    let output = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0 && output.trim().length > 0) {
        resolve();
      } else {
        reject(
          new Error(
            `[FFmpegProvider] ${binary} no esta instalado o no se encuentra en PATH`
          )
        );
      }
    });
    proc.on("error", () => {
      reject(
        new Error(
          `[FFmpegProvider] No se pudo verificar la existencia de ${binary}`
        )
      );
    });
  });
}

/**
 * Valida que un archivo exista y sea legible.
 */
async function validateFilePath(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);
  try {
    await access(resolved, constants.R_OK);
  } catch {
    throw new Error(
      `[FFmpegProvider] Archivo no accesible: ${resolved}`
    );
  }
}

/**
 * Ejecuta un comando ffmpeg/ffprobe con spawn y retorna stdout/stderr.
 */
function runProcess(
  binary: string,
  args: string[],
  timeoutMs = 300_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args);

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(
        new Error(
          `[FFmpegProvider] Timeout (${timeoutMs}ms) ejecutando ${binary}`
        )
      );
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `[FFmpegProvider] ${binary} termino con codigo ${code}: ${stderr.substring(0, 500)}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(`[FFmpegProvider] Error ejecutando ${binary}: ${err.message}`)
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Funciones principales
// ---------------------------------------------------------------------------

/**
 * Quema subtitulos (hardcode) en un video a partir de un archivo .srt.
 */
async function addSubtitles(
  videoPath: string,
  srtPath: string,
  outputPath: string
): Promise<string> {
  await verifyBinaryExists("ffmpeg");
  await validateFilePath(videoPath);
  await validateFilePath(srtPath);

  const resolvedVideo = path.resolve(videoPath);
  const resolvedSrt = path.resolve(srtPath);
  const resolvedOutput = path.resolve(outputPath);

  logger.info(
    `[FFmpegProvider] Agregando subtitulos: video=${resolvedVideo} srt=${resolvedSrt}`
  );

  // Escapar caracteres especiales en la ruta del SRT para el filtro de ffmpeg
  const escapedSrt = resolvedSrt
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");

  await runProcess("ffmpeg", [
    "-i", resolvedVideo,
    "-vf", `subtitles='${escapedSrt}'`,
    "-c:a", "copy",
    "-y",
    resolvedOutput
  ]);

  logger.info(
    `[FFmpegProvider] Subtitulos agregados: output=${resolvedOutput}`
  );

  return resolvedOutput;
}

/**
 * Agrega una marca de agua (overlay) al video.
 */
async function addWatermark(
  videoPath: string,
  watermarkPath: string,
  position: WatermarkPosition,
  outputPath: string
): Promise<string> {
  await verifyBinaryExists("ffmpeg");
  await validateFilePath(videoPath);
  await validateFilePath(watermarkPath);

  const resolvedVideo = path.resolve(videoPath);
  const resolvedWatermark = path.resolve(watermarkPath);
  const resolvedOutput = path.resolve(outputPath);

  logger.info(
    `[FFmpegProvider] Agregando watermark: video=${resolvedVideo} position=${position}`
  );

  const padding = 10;
  const overlayPositions: Record<WatermarkPosition, string> = {
    "top-left": `${padding}:${padding}`,
    "top-right": `main_w-overlay_w-${padding}:${padding}`,
    "bottom-left": `${padding}:main_h-overlay_h-${padding}`,
    "bottom-right": `main_w-overlay_w-${padding}:main_h-overlay_h-${padding}`,
    center: "(main_w-overlay_w)/2:(main_h-overlay_h)/2"
  };

  const overlay = overlayPositions[position] || overlayPositions["bottom-right"];

  await runProcess("ffmpeg", [
    "-i", resolvedVideo,
    "-i", resolvedWatermark,
    "-filter_complex", `overlay=${overlay}`,
    "-c:a", "copy",
    "-y",
    resolvedOutput
  ]);

  logger.info(
    `[FFmpegProvider] Watermark agregado: output=${resolvedOutput}`
  );

  return resolvedOutput;
}

/**
 * Concatena multiples clips de video en uno solo.
 * Todos los clips deben tener el mismo codec/resolucion para concat demuxer.
 */
async function concatenateVideos(
  videoPaths: string[],
  outputPath: string
): Promise<string> {
  await verifyBinaryExists("ffmpeg");

  if (videoPaths.length === 0) {
    throw new Error("[FFmpegProvider] Se requiere al menos un video para concatenar");
  }

  for (const vp of videoPaths) {
    await validateFilePath(vp);
  }

  const resolvedOutput = path.resolve(outputPath);

  logger.info(
    `[FFmpegProvider] Concatenando ${videoPaths.length} videos`
  );

  // Construir filtro complex para re-encode con escalado uniforme
  const inputs: string[] = [];
  const filterParts: string[] = [];

  videoPaths.forEach((vp, i) => {
    inputs.push("-i", path.resolve(vp));
    filterParts.push(`[${i}:v:0][${i}:a:0]`);
  });

  const filterComplex =
    filterParts.join("") +
    `concat=n=${videoPaths.length}:v=1:a=1[outv][outa]`;

  await runProcess("ffmpeg", [
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[outv]",
    "-map", "[outa]",
    "-c:v", "libx264",
    "-c:a", "aac",
    "-y",
    resolvedOutput
  ]);

  logger.info(
    `[FFmpegProvider] Concatenacion completada: output=${resolvedOutput}`
  );

  return resolvedOutput;
}

/**
 * Extrae un frame del video como thumbnail en formato jpg.
 */
async function extractThumbnail(
  videoPath: string,
  timeOffset: number,
  outputPath: string
): Promise<string> {
  await verifyBinaryExists("ffmpeg");
  await validateFilePath(videoPath);

  const resolvedVideo = path.resolve(videoPath);
  const resolvedOutput = path.resolve(outputPath);

  logger.info(
    `[FFmpegProvider] Extrayendo thumbnail: video=${resolvedVideo} offset=${timeOffset}s`
  );

  await runProcess("ffmpeg", [
    "-i", resolvedVideo,
    "-ss", String(timeOffset),
    "-vframes", "1",
    "-q:v", "2",
    "-y",
    resolvedOutput
  ]);

  logger.info(
    `[FFmpegProvider] Thumbnail extraido: output=${resolvedOutput}`
  );

  return resolvedOutput;
}

/**
 * Obtiene informacion detallada del video usando ffprobe.
 */
async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
  await verifyBinaryExists("ffprobe");
  await validateFilePath(videoPath);

  const resolvedVideo = path.resolve(videoPath);

  logger.info(
    `[FFmpegProvider] Obteniendo info: video=${resolvedVideo}`
  );

  const { stdout } = await runProcess("ffprobe", [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    resolvedVideo
  ]);

  const parsed = JSON.parse(stdout) as {
    streams: Array<{
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      bit_rate?: string;
    }>;
    format: {
      duration?: string;
      size?: string;
      bit_rate?: string;
    };
  };

  const videoStream = parsed.streams.find(
    (s) => s.codec_type === "video"
  );

  // Parsear frame rate (formato "30/1" o "30000/1001")
  let fps = 0;
  if (videoStream?.r_frame_rate) {
    const parts = videoStream.r_frame_rate.split("/");
    if (parts.length === 2) {
      fps = Math.round(Number(parts[0]) / Number(parts[1]));
    }
  }

  const info: VideoInfo = {
    duration: parseFloat(parsed.format.duration || "0"),
    width: videoStream?.width || 0,
    height: videoStream?.height || 0,
    codec: videoStream?.codec_name || "unknown",
    size: parseInt(parsed.format.size || "0", 10),
    bitrate: parseInt(parsed.format.bit_rate || "0", 10),
    fps
  };

  logger.info(
    `[FFmpegProvider] Info: ${info.width}x${info.height} ${info.codec} ` +
      `${info.duration}s ${info.fps}fps ${Math.round(info.size / 1024)}KB`
  );

  return info;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export {
  addSubtitles,
  addWatermark,
  concatenateVideos,
  extractThumbnail,
  getVideoInfo
};
export type { WatermarkPosition, VideoInfo };

export default {
  addSubtitles,
  addWatermark,
  concatenateVideos,
  extractThumbnail,
  getVideoInfo
};
