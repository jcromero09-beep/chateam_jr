#!/usr/bin/env node
/**
 * Ejecuta un comando con el MISMO entorno con el que PM2 arranca la app.
 *
 *     node scripts/withPm2Env.cjs npx tsx scripts/backfillTokenHash.ts --dry-run
 *
 * ## Por qué existe
 *
 * [2026-08-01] El `.env` del proyecto está DESACTUALIZADO: dice `localhost:5432`,
 * donde hay otro Postgres que no acepta esta conexión. Un script de operación que
 * dependa de él no falla — se queda COLGADO en `authenticate()` hasta que expira el
 * pool, sin un solo mensaje de error. Pasó dos veces antes de que se viera.
 *
 * La base real (chateamjr) vive en el contenedor chateam-postgres, 127.0.0.1:5434,
 * y quien lo sabe es `ecosystem.chateam.local.config.cjs`: es el entorno con el que
 * corre la app de verdad. Un script que va a escribir en producción tiene que
 * apuntar a la misma base que la aplicación, no a la que dice un fichero que nadie
 * actualizó.
 *
 * ## Por qué un proceso aparte y no `process.env[...] = ...` dentro del script
 *
 * Se intentó primero y no funciona, por dos motivos encadenados:
 *
 *   1. Los `import` se HOISTEAN por encima del código top-level. `database` lee
 *      process.env al evaluarse, así que ya se ha construido con el entorno viejo
 *      antes de que la primera línea del script llegue a correr.
 *   2. El proyecto es `"type": "module"`, así que ni siquiera hay `require` para
 *      adelantarse a los imports.
 *
 * Preparar el entorno en el PADRE elimina el problema de raíz: el hijo arranca con
 * las variables ya puestas y no depende del orden en que se evalúe nada.
 *
 * El entorno explícito manda sobre el del ecosystem, para poder apuntar a otra base
 * sin editar ficheros:  DB_NAME=otra node scripts/withPm2Env.cjs ...
 */
const { spawn } = require("child_process");
const path = require("path");

const ECOSYSTEM = path.join(__dirname, "..", "ecosystem.chateam.local.config.cjs");
const APP = process.env.PM2_APP_NAME || "chateam-node";

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("uso: node scripts/withPm2Env.cjs <comando> [args...]");
  process.exit(2);
}

let apps;
try {
  ({ apps } = require(ECOSYSTEM));
} catch (err) {
  console.error(`No se pudo leer ${ECOSYSTEM}: ${err.message}`);
  process.exit(1);
}

const app = (apps || []).find(a => a.name === APP);
if (!app) {
  console.error(
    `El ecosystem no define la app "${APP}". Definidas: ${(apps || [])
      .map(a => a.name)
      .join(", ")}`
  );
  process.exit(1);
}

const envPm2 = app.env || {};
// El entorno del proceso gana; el ecosystem solo rellena lo que falta.
const env = { ...envPm2, ...process.env };

// Se dice a qué base se apunta ANTES de ejecutar nada. Sin contraseñas.
console.error(
  `[withPm2Env] ${APP} → ${env.DB_NAME}@${env.DB_HOST}:${env.DB_PORT} (usuario ${env.DB_USER})`
);

const hijo = spawn(cmd, args, { env, stdio: "inherit" });

// `spawn` emite el fallo de arranque de forma ASÍNCRONA: sin este handler, un
// comando inexistente tumba el proceso con un error sin contexto en vez de decir
// qué se intentó ejecutar.
hijo.on("error", err => {
  console.error(`[withPm2Env] no se pudo ejecutar "${cmd}": ${err.message}`);
  process.exit(1);
});
hijo.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[withPm2Env] terminado por señal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
