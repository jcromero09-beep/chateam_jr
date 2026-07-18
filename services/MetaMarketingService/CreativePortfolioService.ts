/**
 * [Fase2·D2.1] Portafolio creativo para anuncios CTWA.
 *
 * Meta no acepta un anuncio sin contenido multimedia (error_subcode 1487212:
 * "Falta contenido multimedia"), y la imagen no viaja en el anuncio: primero se
 * sube a la biblioteca de la cuenta (/adimages) y luego se referencia por su
 * `image_hash`. Este servicio cubre ese paso y el preview por ubicacion.
 */
import fs from "fs";
import FormData from "form-data";
import axios from "axios";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { getCompanyMetaConfig } from "./index";

const PREFIX = "[CreativePortfolio]";
const GRAPH = "https://graph.facebook.com";
const apiVersion = () => process.env.FB_GRAPH_VERSION || "v24.0";

export type UploadedImage = { hash: string; url?: string; name?: string; width?: number; height?: number };

const graphMsg = (err: any): string =>
  err?.response?.data?.error?.error_user_msg ||
  err?.response?.data?.error?.message ||
  err?.message ||
  String(err);

/** Sube una imagen a la biblioteca de la cuenta y devuelve su image_hash. */
export const uploadAdImage = async (
  companyId: number,
  filePath: string,
  fileName?: string
): Promise<UploadedImage> => {
  const config = await getCompanyMetaConfig(companyId);
  if (!fs.existsSync(filePath)) {
    throw new AppError("ERR_CREATIVE_FILE_NOT_FOUND", 400);
  }

  const form = new FormData();
  form.append("filename", fs.createReadStream(filePath), fileName || "creative.jpg");
  form.append("access_token", config.token);

  try {
    const { data } = await axios.post(
      `${GRAPH}/${apiVersion()}/act_${config.accountId}/adimages`,
      form,
      { headers: form.getHeaders(), maxBodyLength: Infinity, maxContentLength: Infinity }
    );

    // Respuesta: { images: { "<filename>": { hash, url, width, height } } }
    const images = data?.images || {};
    const first: any = Object.values(images)[0];
    if (!first?.hash) {
      logger.error(`${PREFIX} respuesta inesperada de /adimages: ${JSON.stringify(data)}`);
      throw new AppError("ERR_CREATIVE_NO_HASH: Meta no devolvio image_hash", 502);
    }

    logger.info(`${PREFIX} imagen subida company=${companyId} hash=${first.hash}`);
    return { hash: first.hash, url: first.url, name: first.name, width: first.width, height: first.height };
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`ERR_CREATIVE_UPLOAD: ${graphMsg(err)}`, 400);
  }
};

/** Lista la biblioteca de imagenes de la cuenta (el "portafolio"). */
export const listAdImages = async (companyId: number, limit = 50): Promise<UploadedImage[]> => {
  const config = await getCompanyMetaConfig(companyId);
  try {
    const { data } = await axios.get(`${GRAPH}/${apiVersion()}/act_${config.accountId}/adimages`, {
      params: { access_token: config.token, fields: "hash,url,name,width,height", limit }
    });
    return (data?.data || []).map((i: any) => ({
      hash: i.hash, url: i.url, name: i.name, width: i.width, height: i.height
    }));
  } catch (err: any) {
    throw new AppError(`ERR_CREATIVE_LIST: ${graphMsg(err)}`, 400);
  }
};

/**
 * Preview del anuncio renderizado por Meta para una ubicacion concreta.
 * Devuelve un <iframe> que Meta firma; caduca, no se puede cachear indefinidamente.
 */
export const generatePreview = async (
  companyId: number,
  creative: { object_story_spec: any },
  adFormat = "MOBILE_FEED_STANDARD"
): Promise<string> => {
  const config = await getCompanyMetaConfig(companyId);
  try {
    const { data } = await axios.get(`${GRAPH}/${apiVersion()}/act_${config.accountId}/generatepreviews`, {
      params: {
        access_token: config.token,
        creative: JSON.stringify(creative),
        ad_format: adFormat
      }
    });
    const body = data?.data?.[0]?.body;
    if (!body) throw new AppError("ERR_PREVIEW_EMPTY: Meta no devolvio preview", 502);
    return body;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    throw new AppError(`ERR_PREVIEW: ${graphMsg(err)}`, 400);
  }
};

/**
 * object_story_spec de carrusel CTWA: varias tarjetas, mismo CTA a WhatsApp.
 * `child_attachments` exige minimo 2 tarjetas; Meta rechaza 1.
 */
export const buildCarouselStorySpec = (params: {
  pageId: string;
  message: string;
  cards: Array<{ imageHash: string; headline?: string; description?: string }>;
}) => {
  if (!params.cards?.length || params.cards.length < 2) {
    throw new AppError("ERR_CAROUSEL_MIN_CARDS: un carrusel necesita al menos 2 tarjetas", 400);
  }
  return {
    page_id: params.pageId,
    link_data: {
      message: params.message,
      link: "https://api.whatsapp.com/send",
      child_attachments: params.cards.map(c => ({
        link: "https://api.whatsapp.com/send",
        image_hash: c.imageHash,
        ...(c.headline ? { name: c.headline } : {}),
        ...(c.description ? { description: c.description } : {})
      })),
      call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } }
    }
  };
};

export default { uploadAdImage, listAdImages, generatePreview, buildCarouselStorySpec };
