import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Incidente 2026-08-01] Añade `tokenHash` (STRING(64)) a Whatsapps + índice.
 *
 * ## Qué pasó
 *
 * El 26/07 se cifró `Whatsapp.token` en reposo (commit bc102f7, W1-SEC-06). El
 * cifrado es AES-256-GCM con IV ALEATORIO, así que cifrar el mismo token dos veces
 * da dos textos distintos — imprescindible para que el cifrado sirva de algo, y
 * fatal para `middleware/tokenAuth.ts`, que seguía haciendo:
 *
 *     Whatsapp.findOne({ where: { token } })   // token en claro vs columna cifrada
 *
 * Esa consulta no puede encontrar nada nunca. El `catch` de tokenAuth convertía el
 * fallo en un 403, así que la API pública (/api/send, /api/send-template,
 * /api/checkNumber, /api/checkNumbers, /api/send/linkImage) llevaba SEIS DÍAS
 * rechazando a todos los clientes con integraciones. Ningún test la ejercitaba.
 *
 * ## El arreglo
 *
 * Una huella determinista al lado del cifrado: HMAC-SHA256(token, ENCRYPTION_KEY),
 * que el setter del modelo mantiene solo. tokenAuth busca por ella. El token sigue
 * cifrado en reposo; lo que se puede buscar es la huella, y sin la clave esa huella
 * no permite confirmar un token candidato (por eso HMAC y no SHA-256 pelado).
 *
 * ## Después de aplicar
 *
 * Hace falta rellenar las filas existentes — el índice no sirve con la columna a
 * null. `npx tsx scripts/backfillTokenHash.ts` lo hace (el getter descifra, así que
 * los tokens actuales se pueden rehashear sin conocerlos).
 *
 * ⚠️ Igual que el resto de migraciones recientes: aplicar por SQL directo, NO con
 * `npm run db:migrate`. El runner está desincronizado (SequelizeMeta no refleja el
 * disco) e intentaría aplicar cientos de ficheros. El `up` es idempotente.
 *
 *     ALTER TABLE "Whatsapps" ADD COLUMN IF NOT EXISTS "tokenHash" VARCHAR(64);
 *     CREATE INDEX IF NOT EXISTS "whatsapps_token_hash" ON "Whatsapps" ("tokenHash");
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("Whatsapps");
    if (!table.tokenHash) {
      await queryInterface.addColumn("Whatsapps", "tokenHash", {
        type: DataTypes.STRING(64),
        allowNull: true
      });
    }
    // tokenAuth consulta por esta columna en CADA petición de la API pública.
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "whatsapps_token_hash" ON "Whatsapps" ("tokenHash");'
    );
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "whatsapps_token_hash";'
    );
    const table = await queryInterface.describeTable("Whatsapps");
    if (table.tokenHash) {
      await queryInterface.removeColumn("Whatsapps", "tokenHash");
    }
  }
};
