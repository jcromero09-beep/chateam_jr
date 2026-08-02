/**
 * Impide que un proceso de desarrollo escriba en la base de PRODUCCIÓN por accidente.
 *
 * ## El accidente que ya ocurrió
 *
 * [2026-08-02] Hay dos copias del repo —`/opt/chateam` (producción, bajo PM2) y
 * `~/chateam_jr` (desarrollo)— y el `.env` de desarrollo apunta a `chateamjr`, que es
 * **la base de producción**. Cualquier script lanzado desde el repo de desarrollo
 * escribe en los datos reales sin que nada lo advierta.
 *
 * Eso no es una hipótesis: fue la causa del incidente del 26/07. El código de
 * desarrollo cifraba `Whatsapp.token` al guardarlo; producción todavía no tenía ese
 * cambio y no sabía descifrarlo. Al primer guardado desde desarrollo, los tokens de
 * la base quedaron cifrados y la API pública empezó a devolver 403 a TODOS los
 * clientes con integraciones. Seis días.
 *
 * Nadie escribió mal una consulta. El fallo fue que las dos copias comparten datos y
 * nada distinguía cuál estaba tocando qué.
 *
 * ## Qué hace
 *
 * Si se va a conectar a la base de producción y el proceso NO se declara de
 * producción, aborta con instrucciones. Las tres situaciones normales siguen
 * funcionando sin tocar nada:
 *
 *   - **La app bajo PM2** → el ecosystem pone `NODE_ENV=production`. Pasa.
 *   - **Los scripts de operación** → `withPm2Env.cjs` hereda ese mismo entorno, así
 *     que también pasan. Es lo correcto: operar sobre producción es deliberado.
 *   - **Los tests** → van contra `chateam_test`, que no es la base de producción.
 *
 * Lo único que corta es lo que nunca debió pasar: un script suelto desde el repo de
 * desarrollo apuntando a los datos reales.
 *
 * ## La salida de emergencia
 *
 * `ALLOW_PROD_DB=1` lo salta. Existe porque un guard sin escape se acaba borrando el
 * día que estorba, y porque hay casos legítimos (una consulta puntual de
 * diagnóstico). Al usarla lo dice en el log: la idea es que quede constancia de que
 * alguien tocó producción a mano, no que sea cómodo.
 *
 * ## Lo que esto NO arregla
 *
 * Es un cordón, no una solución. Mientras las dos copias compartan base de datos, el
 * acoplamiento sigue ahí: un cambio de esquema hecho desde desarrollo sigue llegando
 * a producción al instante. La solución de verdad es que desarrollo tenga su propia
 * base — trabajo mayor, y hasta entonces esto evita la repetición del accidente.
 */
import logger from "../utils/logger";

/** Nombre de la base de producción. Configurable por si cambia el despliegue. */
const PROD_DB = (process.env.PROD_DB_NAME || "chateamjr").trim();

export const assertNotProductionDb = (dbName: string | undefined): void => {
  const objetivo = (dbName || "").trim();
  if (!objetivo || objetivo !== PROD_DB) return;

  if (process.env.NODE_ENV === "production") return;

  if (process.env.ALLOW_PROD_DB === "1") {
    logger.warn(
      `[prodDbGuard] conectando a la base de PRODUCCIÓN (${objetivo}) con ` +
        `ALLOW_PROD_DB=1 y NODE_ENV=${process.env.NODE_ENV || "(sin definir)"}. ` +
        `Queda constancia a propósito.`
    );
    return;
  }

  // Se lanza en vez de avisar: un aviso en un script que va a escribir no lo lee
  // nadie hasta que ya ha escrito.
  throw new Error(
    `\n[prodDbGuard] BLOQUEADO: este proceso iba a conectarse a la base de ` +
      `PRODUCCIÓN ("${objetivo}") sin declararse de producción ` +
      `(NODE_ENV=${process.env.NODE_ENV || "sin definir"}).\n\n` +
      `Las dos copias del repo comparten esta base. En julio de 2026, un guardado ` +
      `hecho desde el repo de desarrollo cifró los tokens de la API y dejó a todos ` +
      `los clientes con integraciones fuera durante seis días.\n\n` +
      `Qué hacer, según lo que quieras:\n\n` +
      `  · Operar sobre producción a propósito (backfills, diagnóstico):\n` +
      `      node scripts/withPm2Env.cjs npx tsx <script>\n` +
      `    Hereda el entorno de PM2 y pasa este control.\n\n` +
      `  · Trabajar en local: apunta DB_NAME a otra base, no a ${PROD_DB}.\n\n` +
      `  · Sé lo que hago y aun así quiero esto:\n` +
      `      ALLOW_PROD_DB=1 <comando>\n`
  );
};

export default assertNotProductionDb;
