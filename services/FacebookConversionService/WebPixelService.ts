/**
 * [Fase2·B7.1] Generador del snippet del Píxel web (fbq) + validación.
 *
 * El píxel del navegador y la Conversions API (servidor) deben mandar los MISMOS
 * eventos con el MISMO event_id: asi Meta deduplica y no cuenta doble. Este
 * servicio arma el snippet ya con esa dedup preparada, en vez de dejar al cliente
 * copiar el de Meta (que no la trae) y acabar con conversiones infladas.
 */
import axios from "axios";
import FacebookDataset from "../../models/FacebookDataset";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { getApiVersion } from "./SendWebsiteEvent";

const PREFIX = "[WebPixel]";

// Eventos estandar que el snippet deja listos. Se corresponden con los que el
// dispatcher CAPI ya sabe enviar, para que la dedup por event_id case.
export const STANDARD_PIXEL_EVENTS = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Lead",
  "Purchase"
] as const;

export const resolvePixelId = async (companyId: number): Promise<string | undefined> => {
  // FacebookDataset no tiene isDefault; el mas reciente con pixelId es el bueno.
  const dataset = await FacebookDataset.findOne({
    where: { companyId } as any,
    order: [["id", "DESC"]] as any
  }).catch(() => null);
  return (dataset as any)?.pixelId || (dataset as any)?.datasetId || undefined;
};

/**
 * Snippet base + helper `chateamTrack(event, data, eventId)` que emite el evento
 * con event_id, el mismo identificador que se debe mandar por CAPI. Sin argumentos
 * de evento, solo instala el pixel y dispara PageView.
 */
export const buildPixelSnippet = (pixelId: string): string => {
  return `<!-- Meta Pixel · Chateam -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
/* Dedup con la Conversions API: pasa el MISMO eventId que envies por servidor. */
window.chateamTrack = function (event, data, eventId) {
  var opts = eventId ? { eventID: eventId } : undefined;
  fbq('track', event, data || {}, opts);
};
</script>
<noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel -->`;
};

export type PixelSnippetResult = {
  pixelId: string;
  snippet: string;
  events: readonly string[];
  instructions: string;
};

export const generatePixelSnippet = async (companyId: number): Promise<PixelSnippetResult> => {
  const pixelId = await resolvePixelId(companyId);
  if (!pixelId) {
    throw new AppError(
      "ERR_PIXEL_NO_ID: no hay un Pixel/Dataset vinculado. Conecta Meta y sincroniza datasets primero.",
      400
    );
  }
  return {
    pixelId,
    snippet: buildPixelSnippet(pixelId),
    events: STANDARD_PIXEL_EVENTS,
    instructions:
      "Pega este código antes de </head> en TODAS las páginas del sitio. Para eventos " +
      "con valor (Purchase, Lead), llama window.chateamTrack('Purchase', {value: 25, currency: 'USD'}, eventId)."
  };
};

export type PixelValidation = {
  installed: boolean;
  reachable: boolean;
  pixelIdMatches: boolean;
  firesPageView: boolean;
  url: string;
  detail: string;
};

/**
 * Valida que el pixel está instalado en una URL: descarga el HTML y comprueba que
 * carga fbevents.js, inicializa CON ESTE pixelId y dispara PageView. No ejecuta JS
 * (no hay navegador headless aqui), asi que valida el snippet estatico — suficiente
 * para cazar el 90% de instalaciones olvidadas o con el id equivocado.
 */
export const validatePixelInstall = async (
  companyId: number,
  url: string
): Promise<PixelValidation> => {
  const pixelId = await resolvePixelId(companyId);
  if (!pixelId) throw new AppError("ERR_PIXEL_NO_ID", 400);

  let target: URL;
  try {
    target = new URL(url.startsWith("http") ? url : `https://${url}`);
  } catch {
    throw new AppError("ERR_PIXEL_BAD_URL: URL inválida", 400);
  }

  const base: PixelValidation = {
    installed: false, reachable: false, pixelIdMatches: false,
    firesPageView: false, url: target.toString(), detail: ""
  };

  let html = "";
  try {
    const res = await axios.get(target.toString(), {
      timeout: 10000,
      maxRedirects: 5,
      headers: { "User-Agent": "ChateamPixelValidator/1.0" },
      responseType: "text",
      // Un 404/500 igual trae HTML util; no tirar por status.
      validateStatus: () => true
    });
    base.reachable = true;
    html = typeof res.data === "string" ? res.data : String(res.data || "");
  } catch (err: any) {
    return { ...base, detail: `No se pudo abrir la página: ${err?.message || err}` };
  }

  const hasFbevents = /connect\.facebook\.net\/[^"']*\/fbevents\.js/.test(html) || /fbq\(/.test(html);
  const initRegex = new RegExp(`fbq\\(\\s*['"]init['"]\\s*,\\s*['"]${pixelId}['"]`);
  const pixelIdMatches = initRegex.test(html);
  const firesPageView = /fbq\(\s*['"]track['"]\s*,\s*['"]PageView['"]/.test(html);
  const anyPixelId = /fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,})['"]/.exec(html)?.[1];

  const installed = hasFbevents && pixelIdMatches;

  let detail: string;
  if (installed && firesPageView) {
    detail = "Pixel instalado correctamente y disparando PageView.";
  } else if (hasFbevents && anyPixelId && !pixelIdMatches) {
    detail = `Hay un Pixel instalado (${anyPixelId}) pero NO es el de esta cuenta (${pixelId}). Revisa el id.`;
  } else if (!hasFbevents) {
    detail = "No se encontró el Pixel en la página. Pega el snippet antes de </head>.";
  } else if (!firesPageView) {
    detail = "El Pixel está pero no dispara PageView; revisa el snippet.";
  } else {
    detail = "Instalación incompleta.";
  }

  logger.info(`${PREFIX} validación company=${companyId} url=${target.hostname} installed=${installed}`);
  return { ...base, installed, pixelIdMatches, firesPageView, detail };
};

export default { generatePixelSnippet, validatePixelInstall, buildPixelSnippet, resolvePixelId };
