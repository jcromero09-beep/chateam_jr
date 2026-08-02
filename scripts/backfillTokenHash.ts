/**
 * Rellena `Whatsapps.tokenHash` en las filas que ya existían.
 *
 * [Incidente 2026-08-01] La columna nace vacía, y con ella vacía la API pública
 * sigue caída: tokenAuth busca `where: { tokenHash }` y no encuentra nada. Este
 * script es el segundo paso obligatorio, no un extra.
 *
 * Funciona porque el getter del modelo DESCIFRA al leer: se puede recalcular la
 * huella de tokens que nadie conoce en claro. Guardar el registro dispara el setter,
 * que recifra el token (con un IV nuevo, es lo esperado) y escribe la huella.
 *
 * ## Cómo se ejecuta
 *
 *     node scripts/withPm2Env.cjs npx tsx scripts/backfillTokenHash.ts --dry-run
 *     node scripts/withPm2Env.cjs npx tsx scripts/backfillTokenHash.ts
 *
 * SIEMPRE a través de `withPm2Env`, nunca `npx tsx` a secas. El `.env` del proyecto
 * está desactualizado —apunta a `localhost:5432`, otra base— y un script que lo use
 * no falla: se queda COLGADO en `authenticate()` sin un solo mensaje. El runner pone
 * el entorno real de PM2 antes de arrancar este proceso; el porqué de hacerlo en el
 * padre y no aquí dentro está explicado en su cabecera.
 *
 * Es idempotente: por defecto solo toca filas con tokenHash a null. Con --force
 * recalcula todas (lo que hace falta si alguna vez cambia ENCRYPTION_KEY: las
 * huellas viejas dejan de coincidir y hay que rehacerlas).
 */
import "../bootstrap";
import sequelize from "../database";
import Whatsapp from "../models/Whatsapp";
import { hashSecret } from "../helpers/secretCrypto";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

async function main() {
  // Se dice a qué base se va a escribir ANTES de escribir. Este script cambia una
  // columna en producción; equivocarse de base es el fallo caro.
  const cfg: any = sequelize.config;
  console.log(`Base: ${cfg.database} @ ${cfg.host}:${cfg.port} (usuario ${cfg.username})`);
  await sequelize.authenticate();

  const conexiones = await Whatsapp.findAll({
    attributes: ["id", "name", "companyId", "token", "tokenHash"]
  });

  // El filtro va aquí y no en el WHERE porque `token` pasa por el getter que
  // descifra: hay que leer la fila para saber si tiene token de verdad.
  const pendientes = conexiones.filter(w => {
    if (!w.token) return false;
    return force || !w.tokenHash;
  });

  console.log(`Conexiones: ${conexiones.length} · a rehashear: ${pendientes.length}`);
  if (dryRun) {
    pendientes.forEach(w =>
      console.log(`  [dry-run] #${w.id} ${w.name} (company ${w.companyId})`)
    );
    await sequelize.close();
    return;
  }

  let ok = 0;
  for (const w of pendientes) {
    const huella = hashSecret(w.token);
    // update() directo sobre la columna: pasar por el setter de `token` recifraría
    // el secreto sin necesidad, y cada recifrado es una oportunidad de perderlo.
    await Whatsapp.update(
      { tokenHash: huella } as any,
      { where: { id: w.id }, hooks: false, silent: true }
    );
    ok += 1;
    console.log(`  ok · #${w.id} ${w.name}`);
  }

  // Verificación: lo que importa no es "actualicé N filas", es que tokenAuth
  // encuentre. Se comprueba la consulta REAL que hace el middleware.
  let verificadas = 0;
  for (const w of pendientes) {
    const fresca = await Whatsapp.findByPk(w.id);
    const encontrada = await Whatsapp.findOne({
      where: { tokenHash: hashSecret(fresca!.token) }
    });
    if (encontrada?.id === w.id) verificadas += 1;
    else console.error(`  FALLA · #${w.id} no se encuentra por su huella`);
  }

  console.log(`\nRehasheadas ${ok}/${pendientes.length} · verificadas ${verificadas}`);
  await sequelize.close();
  process.exit(verificadas === pendientes.length ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
