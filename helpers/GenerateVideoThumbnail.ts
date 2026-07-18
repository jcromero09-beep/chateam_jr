import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
import logger from "../utils/logger";

/**
 * Metadata que WhatsApp necesita para RENDERIZAR el preview de un video.
 *
 * ¿Por qué existe este helper?
 * Baileys genera el thumbnail del video ejecutando el comando `ffmpeg` del PATH
 * del SISTEMA; si no está, envía el video SIN `jpegThumbnail`. Además, Baileys NO
 * extrae `width`/`height`/`seconds` de los videos. Sin esas dimensiones, aunque el
 * thumbnail viaje, WhatsApp no sabe dimensionar el recuadro y NO muestra el
 * preview: solo ofrece descargar. Aquí generamos el thumbnail y extraemos la
 * metadata para pasarlos en el `videoMessage`.
 *
 * Degradación elegante: cualquier fallo devuelve el campo en `null`/`undefined` y
 * el envío continúa igual — NUNCA rompe el envío del video.
 */
export interface VideoMessageMeta {
  jpegThumbnail: string | null;
  width?: number;
  height?: number;
  seconds?: number;
}

const runFfmpegThumb = (
  inputPath: string,
  outputPath: string,
  seek: string
): Promise<void> =>
  new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-ss",
      seek,
      "-i",
      inputPath,
      "-frames:v",
      "1",
      // Ancho máx 320px sin ampliar videos pequeños; alto par automático.
      "-vf",
      "scale='min(320,iw)':-2",
      "-q:v",
      "4",
      "-f",
      "image2",
      outputPath
    ];

    execFile(
      ffmpegPath.path,
      args,
      { timeout: 15000, windowsHide: true },
      error => (error ? reject(error) : resolve())
    );
  });

const generateThumbnailBase64 = async (
  pathMedia: string
): Promise<string | null> => {
  const outputPath = path.join(
    os.tmpdir(),
    `thumb_${Date.now()}_${randomBytes(6).toString("hex")}.jpg`
  );

  try {
    try {
      // Segundo 1: evita el frame negro inicial de muchos videos.
      await runFfmpegThumb(pathMedia, outputPath, "00:00:01");
    } catch {
      // Fallback para videos de menos de 1s: tomar el primer frame.
      await runFfmpegThumb(pathMedia, outputPath, "00:00:00");
    }

    if (!fs.existsSync(outputPath)) {
      return null;
    }

    const buffer = fs.readFileSync(outputPath);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    return buffer.toString("base64");
  } catch (err) {
    logger.warn(
      `[GenerateVideoThumbnail] No se pudo generar el thumbnail de ${pathMedia}: ${
        (err as Error)?.message
      }`
    );
    return null;
  } finally {
    try {
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
    } catch {
      /* limpieza best-effort */
    }
  }
};

/** Extrae width/height/duración con ffprobe; si no está, parsea `ffmpeg -i`. */
const probeVideoMeta = async (
  pathMedia: string
): Promise<Pick<VideoMessageMeta, "width" | "height" | "seconds">> => {
  // Opción A: ffprobe (viene con ffmpeg del sistema) — salida JSON limpia.
  const viaFfprobe = await new Promise<Pick<
    VideoMessageMeta,
    "width" | "height" | "seconds"
  > | null>(resolve => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        pathMedia
      ],
      { timeout: 15000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        try {
          const json = JSON.parse(stdout);
          const stream = json?.streams?.[0] || {};
          const duration = parseFloat(json?.format?.duration);
          resolve({
            width: Number(stream.width) || undefined,
            height: Number(stream.height) || undefined,
            seconds: Number.isFinite(duration) ? Math.round(duration) : undefined
          });
        } catch {
          resolve(null);
        }
      }
    );
  });

  if (viaFfprobe && (viaFfprobe.width || viaFfprobe.seconds)) {
    return viaFfprobe;
  }

  // Opción B (fallback): parsear el stderr de `ffmpeg -i` (binario del proyecto).
  return new Promise(resolve => {
    execFile(
      ffmpegPath.path,
      ["-i", pathMedia],
      { timeout: 15000, windowsHide: true },
      (_error, _stdout, stderr) => {
        try {
          const text = stderr || "";
          const dim = text.match(/,\s(\d{2,5})x(\d{2,5})[\s,]/);
          const dur = text.match(/Duration:\s(\d+):(\d+):(\d+)/);
          const seconds = dur
            ? parseInt(dur[1], 10) * 3600 +
              parseInt(dur[2], 10) * 60 +
              parseInt(dur[3], 10)
            : undefined;
          resolve({
            width: dim ? parseInt(dim[1], 10) : undefined,
            height: dim ? parseInt(dim[2], 10) : undefined,
            seconds
          });
        } catch {
          resolve({});
        }
      }
    );
  });
};

/**
 * Devuelve la metadata completa para el `videoMessage` de WhatsApp:
 * thumbnail (base64) + dimensiones + duración. Todos los campos son
 * best-effort: si alguno falla, se omite y el video se envía igual.
 */
const generateVideoThumbnail = async (
  pathMedia: string
): Promise<VideoMessageMeta> => {
  try {
    if (!pathMedia || !fs.existsSync(pathMedia)) {
      return { jpegThumbnail: null };
    }

    const [jpegThumbnail, meta] = await Promise.all([
      generateThumbnailBase64(pathMedia),
      probeVideoMeta(pathMedia)
    ]);

    return {
      jpegThumbnail,
      width: meta.width,
      height: meta.height,
      seconds: meta.seconds
    };
  } catch (err) {
    logger.warn(
      `[GenerateVideoThumbnail] No se pudo preparar la metadata de ${pathMedia}: ${
        (err as Error)?.message
      }`
    );
    return { jpegThumbnail: null };
  }
};

/**
 * Construye los campos extra listos para hacer spread dentro del content de
 * video de `wbot.sendMessage` (`jpegThumbnail`, `width`, `height`, `seconds`).
 * Solo incluye los que se obtuvieron correctamente. Devuelve un objeto plano
 * (Record) para que el spread no choque con el tipado de Baileys — `seconds` no
 * está declarado en el content de video pero el proto `videoMessage` sí lo
 * soporta y Baileys lo propaga.
 */
export const buildVideoExtras = (
  meta: VideoMessageMeta
): Record<string, unknown> => {
  const extras: Record<string, unknown> = {};
  if (meta.jpegThumbnail) extras.jpegThumbnail = meta.jpegThumbnail;
  if (meta.width) extras.width = meta.width;
  if (meta.height) extras.height = meta.height;
  if (meta.seconds) extras.seconds = meta.seconds;
  return extras;
};

export default generateVideoThumbnail;
