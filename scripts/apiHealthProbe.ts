/**
 * Sonda de la API pública: comprueba que sigue autenticando y avisa si no.
 *
 *     node scripts/withPm2Env.cjs \
 *       "$NODE22" --import tsx/esm --require tsx/cjs scripts/apiHealthProbe.ts
 *
 * ## Por qué existe
 *
 * [2026-08-02] La API pública estuvo SEIS DÍAS devolviendo 403 a todos los clientes
 * con integraciones y nadie se enteró. No fue por falta de tests —los que se
 * escribieron después reproducían el fallo— sino porque nada miraba producción. Hay
 * un `/health`, pero ningún cron ni alerta lo consulta: existe y no lo lee nadie.
 *
 * Todo lo demás que se construyó ese día detecta fallos ANTES de desplegar. Esto es
 * lo único que detecta que producción está rota AHORA.
 *
 * ## Qué considera "caída" y qué no
 *
 * La distinción es lo importante, porque una sonda que avisa de lo que no toca deja
 * de leerse en una semana:
 *
 *   - **El servidor no responde** → caída.
 *   - **Un token válido recibe 401 o 403** → caída. Este es exactamente el incidente:
 *     la autenticación rechazando a todo el mundo.
 *   - **Cualquier otro código (400, 404, 500…)** → NO es caída. El handler llama a la
 *     sesión de WhatsApp del cliente, que puede estar desconectada por mil motivos
 *     legítimos. Eso no es asunto de esta sonda.
 *
 * Además comprueba el control negativo (sin cabecera debe dar 401) ANTES que nada. Si
 * eso falla, lo más probable es que la ruta haya cambiado — y entonces la prueba con
 * token no mide nada: contra una ruta inexistente todo responde 404, que no es 401 ni
 * 403 y pasaría por bueno. Ese error ya se cometió una vez al diagnosticar a mano.
 *
 * ## Por qué no hace spam
 *
 * Dos capas. La sonda solo avisa tras `UMBRAL` fallos SEGUIDOS (un reload de PM2 tarda
 * unos segundos y no es una incidencia), y `sendOpsAlert` deduplica por clave 24 h.
 * Cuando se recupera manda un segundo aviso: un incidente que se cierra solo también
 * hay que saberlo.
 */
import "../bootstrap";
import fs from "fs";
import { Op } from "sequelize";
import sequelize from "../database";
import Whatsapp from "../models/Whatsapp";
import sendOpsAlert from "../helpers/opsAlert";
import logger from "../utils/logger";

const BASE = process.env.API_PROBE_BASE_URL || "http://127.0.0.1:3010";
const RUTA = "/api/messages/checkNumber";
/** Número imposible: interesa el código de estado, no el resultado. */
const NUMERO = "593999999999";
/** En /var/tmp y no en el repo: es estado de runtime y sobrevive a un reboot. */
const ESTADO = process.env.API_PROBE_STATE || "/var/tmp/chateam-api-probe.json";
const UMBRAL = Number(process.env.API_PROBE_UMBRAL || 3);

type Estado = { fallos: number; alertado: boolean; ultimo?: string };

const leerEstado = (): Estado => {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, "utf8")) as Estado;
  } catch {
    return { fallos: 0, alertado: false };
  }
};

const guardarEstado = (e: Estado): void => {
  try {
    fs.writeFileSync(ESTADO, JSON.stringify(e), "utf8");
  } catch (err) {
    // Sin fichero de estado la sonda sigue midiendo; lo que pierde es la histéresis.
    logger.warn(`[apiProbe] no se pudo guardar el estado en ${ESTADO}: ${err}`);
  }
};

/** Devuelve el código HTTP, o null si el servidor no respondió. */
async function pedir(token: string | null): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}${RUTA}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ number: NUMERO }),
      signal: AbortSignal.timeout(15000)
    });
    return res.status;
  } catch {
    return null;
  }
}

/** null si todo va bien; si no, el motivo de la caída en una frase. */
async function revisar(): Promise<string | null> {
  const sinCabecera = await pedir(null);
  if (sinCabecera === null) {
    return `El servidor no responde en ${BASE}${RUTA}.`;
  }
  if (sinCabecera !== 401) {
    return (
      `Una petición SIN cabecera de autorización devolvió ${sinCabecera} en vez de 401. ` +
      `Lo más probable es que la ruta haya cambiado: contra una ruta que no existe ` +
      `todo responde 404, y entonces esta sonda no estaría midiendo nada.`
    );
  }

  // Una conexión real con huella: sin tokenHash el 403 sería por falta de backfill,
  // no por la autenticación, y el aviso señalaría al sitio equivocado.
  // `Op.not` y no `Op.ne`: en SQL `!= NULL` no casa nunca con nada, así que la sonda
  // no encontraría conexión y se quedaría muda — justo lo que no puede pasar.
  const conexion = await Whatsapp.findOne({
    where: { tokenHash: { [Op.not]: null } },
    order: [["id", "ASC"]]
  });
  if (!conexion?.token) {
    logger.warn("[apiProbe] no hay ninguna conexión con token; no se puede sondear");
    return null;
  }

  const conToken = await pedir(conexion.token);
  if (conToken === null) {
    return `El servidor dejó de responder al probar con un token real.`;
  }
  if (conToken === 401 || conToken === 403) {
    return (
      `Un token VÁLIDO (conexión #${conexion.id} "${conexion.name}", empresa ` +
      `${conexion.companyId}) recibió ${conToken}. La API pública está rechazando a ` +
      `todos los clientes con integraciones.`
    );
  }
  return null;
}

async function main() {
  await sequelize.authenticate();
  const motivo = await revisar();
  const estado = leerEstado();
  const ahora = new Date().toISOString();

  if (motivo) {
    estado.fallos += 1;
    estado.ultimo = ahora;
    logger.error(`[apiProbe] fallo ${estado.fallos}/${UMBRAL}: ${motivo}`);

    if (estado.fallos >= UMBRAL && !estado.alertado) {
      estado.alertado = true;
      const enviado = await sendOpsAlert({
        key: "api-publica-caida",
        subject: "[chateam] La API pública NO está autenticando",
        body:
          `${motivo}\n\n` +
          `Comprobado ${estado.fallos} veces seguidas desde ${BASE}${RUTA}.\n` +
          `Última comprobación: ${ahora}\n\n` +
          `Qué mirar, por orden:\n` +
          `  1. pm2 list — ¿los procesos chateam están online?\n` +
          `  2. pm2 logs chateam-node --err --lines 50\n` +
          `  3. ¿Falta el backfill de tokenHash? scripts/backfillTokenHash.ts --dry-run\n` +
          `  4. Reproducir a mano:\n` +
          `     node scripts/withPm2Env.cjs npx tsx scripts/verifyApiAuth.ts\n\n` +
          `Contexto: en julio de 2026 esto mismo estuvo seis días sin detectarse ` +
          `porque nada vigilaba la API. Esta sonda existe por eso.`
      });
      // Se dice si el correo SALIÓ, no si se intentó. `sendOpsAlert` nunca lanza y
      // devuelve false cuando no hay destinatario o el envío falla: dar por enviado
      // lo que se quedó en el log es la forma de creer que hay vigilancia sin
      // haberla — que es exactamente el problema que esta sonda viene a resolver.
      if (enviado) {
        logger.error("[apiProbe] aviso ENVIADO · la API pública está caída");
      } else {
        logger.error(
          "[apiProbe] la API pública está caída y el aviso NO se pudo enviar " +
            "(¿falta OPS_ALERT_EMAIL o el correo no sale?). Queda solo en este log."
        );
      }
    }
  } else {
    if (estado.alertado) {
      const cerrado = await sendOpsAlert({
        key: "api-publica-recuperada",
        subject: "[chateam] La API pública vuelve a autenticar",
        body:
          `La sonda vuelve a recibir respuestas correctas de ${BASE}${RUTA}.\n` +
          `Último fallo registrado: ${estado.ultimo || "?"}\n` +
          `Recuperada: ${ahora}`
      });
      logger.info(
        `[apiProbe] recuperada · aviso de cierre ${cerrado ? "enviado" : "NO enviado"}`
      );
    }
    estado.fallos = 0;
    estado.alertado = false;
  }

  guardarEstado(estado);
  await sequelize.close();
  // Sale con 0 aunque haya fallo: el canal de aviso es el correo, no el código de
  // salida. Un cron que "falla" solo genera correo del propio cron, que nadie lee.
  process.exit(0);
}

main().catch(err => {
  logger.error(`[apiProbe] error inesperado: ${err}`);
  process.exit(1);
});
