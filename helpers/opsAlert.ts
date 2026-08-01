/**
 * opsAlert — avisos operativos por correo, sin convertirse en spam.
 *
 * Hay sucesos que un log no cubre: un contracargo o una suscripción cancelada
 * necesitan que **alguien se entere**, no que quede escrito por si acaso. El
 * triaje de logs del 2026-07-30 encontró justo eso: un canal de WhatsApp caído
 * repitiéndose en bucle durante días sin que nadie lo supiera.
 *
 * Canal: **correo** (decisión de JC). Se apoya en `helpers/SendMail`, que ya
 * tiene Listmonk con fallback a nodemailer.
 *
 * ## Tres propiedades que lo hacen usable
 *
 * 1. **No lanza nunca.** Un aviso que falla no puede tumbar el flujo que lo
 *    dispara — sería peor la cura: un webhook de Stripe caído porque no salió un
 *    correo. Todo va en try/catch y se degrada a log.
 *
 * 2. **Deduplica por clave.** Stripe reintenta los webhooks ante cualquier
 *    no-2xx: sin esto, un solo contracargo genera un correo por reintento. La
 *    clave debe identificar el SUCESO (id de disputa, id de suscripción), no el
 *    momento.
 *
 * 3. **Si no hay destinatario, lo dice una vez y sigue.** Sin
 *    `OPS_ALERT_EMAIL` no se manda nada — pero se avisa en el log la primera
 *    vez, para que la ausencia de configuración no se confunda con la ausencia
 *    de incidentes. Es el mismo error que tenía el sistema: silencio que parece
 *    normalidad.
 *
 * El aviso NO sustituye al log: el log siempre se escribe en el sitio que llama.
 * Esto es el empujón para que alguien lo mire.
 */
import cache from "../libs/cache";
import { SendMail } from "./SendMail";
import logger from "../utils/logger";

/** Ventana de deduplicación: un mismo suceso no vuelve a avisar en 24 h. */
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

let warnedNoRecipient = false;

export interface OpsAlertInput {
  /**
   * Identifica el SUCESO, no el instante. `stripe-dispute:{id}`,
   * `stripe-subcancel:{id}`. Dos avisos con la misma clave en 24 h → uno solo.
   */
  key: string;
  subject: string;
  /** Cuerpo en texto plano. Se manda también como html envuelto en <pre>. */
  body: string;
}

/**
 * Manda un aviso operativo. Best-effort: devuelve `false` si no se envió (sin
 * destinatario, duplicado, o fallo del correo) y **nunca lanza**.
 */
export const sendOpsAlert = async (input: OpsAlertInput): Promise<boolean> => {
  try {
    const to = (process.env.OPS_ALERT_EMAIL || "").trim();
    if (!to) {
      if (!warnedNoRecipient) {
        warnedNoRecipient = true;
        logger.warn(
          "[opsAlert] OPS_ALERT_EMAIL no está configurado: los avisos operativos " +
            "quedan SOLO en el log. Configúralo o nadie se entera de contracargos " +
            "ni cancelaciones."
        );
      }
      return false;
    }

    const dedupeKey = `ops_alert:sent:${input.key}`;
    if (await cache.get(dedupeKey)) {
      logger.debug(`[opsAlert] ya avisado, se omite: ${input.key}`);
      return false;
    }
    // Se marca ANTES de enviar: si el envío falla, es preferible perder un aviso
    // a mandar veinte porque el proveedor reintenta el webhook.
    await cache.set(dedupeKey, "1", "EX", DEDUPE_TTL_SECONDS);

    await SendMail({
      to,
      subject: input.subject,
      text: input.body,
      html: `<pre style="font-family:monospace;white-space:pre-wrap">${input.body
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`
    });

    logger.info(`[opsAlert] aviso enviado a ${to}: ${input.subject}`);
    return true;
  } catch (err: any) {
    logger.error(
      { err: { name: err?.name, message: err?.message }, key: input?.key },
      "[opsAlert] no se pudo enviar el aviso (el suceso sigue en el log)"
    );
    return false;
  }
};

export default sendOpsAlert;
