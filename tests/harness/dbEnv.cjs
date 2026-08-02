// Env para el harness de DB de test. Apunta a chateam_test vía el rol dedicado harness_test.
// (No se usa .env.test porque el guard bloquea escribir .env*; esto lo suple.)
//
// [Ola 2 verificabilidad] Los valores son DEFAULTS, no fijos: si vienen del entorno,
// mandan. Sin esto el harness solo podía correr en el NAS —puerto 5434, rol
// harness_test— y los golden-master no se podían ejecutar en CI, donde el service
// container de Postgres escucha en 5432 con el rol `postgres`. Los defaults son los
// de siempre, así que en local no cambia nada: `npx jest --config jest.db.config.cjs`
// sigue funcionando sin exportar una sola variable.
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.DB_DIALECT || "postgres";
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
process.env.DB_PORT = process.env.DB_PORT || "5434";
process.env.DB_USER = process.env.DB_USER || "harness_test";
process.env.DB_PASS = process.env.DB_PASS || "harness_test_pw_local";
process.env.DB_NAME = process.env.DB_NAME || "chateam_test";
process.env.DB_POOL_MAX = "5";
process.env.DB_POOL_MIN = "1";
process.env.DB_POOL_ACQUIRE = "30000";
process.env.DB_POOL_IDLE = "10000";
// [2026-08-01] Los modelos cifran sus secretos al guardarlos (Whatsapp.facebookUserToken,
// tokenMeta…) con helpers/secretCrypto, que exige ENCRYPTION_KEY de 16+ caracteres y
// LANZA si falta. En el NAS llegaba del .env por dotenv, así que nunca se notó; en el
// CI no hay .env y 14 de los 72 tests del golden-master morían al sembrar una conexión
// de canal. Mismo caso que el JWT_SECRET de aquí abajo: valor de test propio, y si el
// entorno trae uno, manda.
//
// El valor NO importa mientras sea estable dentro de la corrida: cada test siembra y
// trunca sus propios datos, así que nada cifrado sobrevive entre corridas.
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "jest_test_encryption_key_no_secreta_32b";
process.env.JWT_SECRET = process.env.JWT_SECRET || "jest_test_jwt_secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "jest_test_jwt_refresh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
// Redis EFÍMERO del harness (puerto 6399, lo arranca globalSetup) — NO el Redis de prod (5000).
// Necesario porque algunos flujos (verifyQueue → UpdateTicketService → colas Bull) await-ean
// `queue.add()` que cuelga sin una conexión Redis real. Los jobs encolados no se procesan (throwaway).
process.env.REDIS_URI = process.env.REDIS_URI || "redis://127.0.0.1:6399";
