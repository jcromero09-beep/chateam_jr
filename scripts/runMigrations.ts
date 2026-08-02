/**
 * Runner de migraciones idempotente.
 *
 * Lee el directorio `database/migrations`, compara contra la tabla
 * `SequelizeMeta` y ejecuta sólo las migraciones pendientes en orden.
 *
 * Uso:
 *   npm run build && npm run db:migrate
 */
import "dotenv/config";
import path from "path";
import fs from "fs";
import { Sequelize, QueryInterface } from "sequelize";
import { fileURLToPath, pathToFileURL } from "node:url";

// [2026-08-01] El proyecto es ESM ("module": "ES2022" en tsconfig), y en ESM
// `__dirname` NO EXISTE. Este script lo usaba, así que reventaba con
// `ReferenceError: __dirname is not defined in ES module scope` — tanto con tsx
// sobre la fuente como con `node dist/scripts/runMigrations.js`, porque el
// compilado también es ESM. O sea: `npm run db:migrate` no funcionaba por ningún
// camino. Se vio al ejecutarlo por primera vez en CI.
//
// Mismo patrón que usa el resto del repo para reemplazarlo.
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || "chateamjr";
const DB_USER = process.env.DB_USER || "atendimento";
const DB_PASS = process.env.DB_PASS || "";

// Las migraciones se ejecutan desde los .js compilados (dist/database/migrations).
// Si no existen, se intenta como fallback usar los .ts vía ts-node.
//
// Detección robusta: si el script vive dentro de /dist/, ya está compilado y
// busca migraciones JS hermanas. Si vive en /scripts/ source, usa source migrations.
const isRunningFromDist = currentDir.includes(`${path.sep}dist${path.sep}`);
const PROJECT_ROOT = isRunningFromDist
  ? path.resolve(currentDir, "..", "..") // dist/scripts → project root
  : path.resolve(currentDir, "..");      // scripts → project root

const COMPILED_DIR = path.join(PROJECT_ROOT, "dist", "database", "migrations");
const SOURCE_DIR = path.join(PROJECT_ROOT, "database", "migrations");
/**
 * Forma de una migración. Se contemplan las tres envolturas posibles porque el
 * interop CJS/ESM las deja en sitios distintos: `module.exports` (las 387 de este
 * repo) acaba en `.default`, `export default` también, y una hipotética exportación
 * nombrada queda en la raíz del módulo.
 */
type MigrationFn = (
  queryInterface: QueryInterface,
  sequelize: typeof Sequelize
) => Promise<unknown>;

interface Migration {
  up?: MigrationFn;
  down?: MigrationFn;
}

type MigrationModule = Migration & {
  default?: Migration & { default?: Migration };
};

const MIGRATIONS_DIR = fs.existsSync(COMPILED_DIR) ? COMPILED_DIR : SOURCE_DIR;
const USES_COMPILED = MIGRATIONS_DIR === COMPILED_DIR;

const main = async () => {
  const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "postgres",
    logging: false
  });

  await sequelize.authenticate();
  console.log("✅ Conectado a PostgreSQL");

  // Crear tabla SequelizeMeta si no existe
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
      "name" VARCHAR(255) NOT NULL PRIMARY KEY
    );
  `);

  // Listar migraciones aplicadas
  const [appliedRows]: any = await sequelize.query(
    `SELECT "name" FROM "SequelizeMeta" ORDER BY "name" ASC`
  );
  const applied = new Set<string>(appliedRows.map((r: any) => r.name));

  // Listar migraciones disponibles (.js compilados o .ts si fallback)
  // IMPORTANTE: Si usamos dist/, hay archivos .js, .js.map, .d.ts, .d.ts.map.
  // Filtramos solo .js (no .d.ts) usando endsWith + descarte explícito.
  const ext = USES_COMPILED ? ".js" : ".ts";
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(ext) && !f.endsWith(".d.ts") && !f.endsWith(".js.map"))
    .sort();

  // Sequelize CLI guarda como ".js" históricamente. Comparamos sin extensión.
  const baseName = (f: string) => f.replace(/\.(js|ts)$/, "");
  const appliedBases = new Set<string>(Array.from(applied).map(baseName));
  const pending = files.filter((f) => !appliedBases.has(baseName(f)));

  console.log(`📂 Directorio: ${MIGRATIONS_DIR}`);
  console.log(`📊 Aplicadas en BD: ${applied.size} | Disponibles: ${files.length}`);

  if (pending.length === 0) {
    console.log("ℹ️  No hay migraciones pendientes.");
    await sequelize.close();
    return;
  }

  console.log(`📋 Migraciones pendientes: ${pending.length}`);
  pending.forEach((f) => console.log(`   • ${f}`));

  const queryInterface = sequelize.getQueryInterface();

  for (const file of pending) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    console.log(`\n▶️  Aplicando: ${file}`);
    try {
      // [2026-08-01] Era `require(fullPath)`, que en ESM tampoco existe (mismo
      // motivo que el __dirname de arriba): fallaba con "require is not defined" en
      // la primera migración. Con `import()` dinámico funcionan las dos formas — las
      // migraciones de este repo usan `module.exports`, que el interop deja en
      // `.default`, y las que usen `export default` caen en el mismo sitio.
      const mod = (await import(
        pathToFileURL(fullPath).href
      )) as MigrationModule;
      const migration: Migration =
        mod.default?.default || mod.default || mod;
      if (typeof migration.up !== "function") {
        throw new Error(`La migración ${file} no exporta función up()`);
      }
      await migration.up(queryInterface, Sequelize);
      // Guardamos siempre como .js (convención Sequelize CLI) para que sea
      // compatible con los nombres que ya tenía la tabla antes de este runner.
      const recordName = file.replace(/\.ts$/, ".js");
      await sequelize.query(
        `INSERT INTO "SequelizeMeta" ("name") VALUES (:name) ON CONFLICT DO NOTHING`,
        { replacements: { name: recordName } }
      );
      console.log(`✅ ${file}`);
    } catch (err: any) {
      console.error(`❌ Falló ${file}:`, err?.message || err);
      await sequelize.close();
      process.exit(1);
    }
  }

  await sequelize.close();
  console.log("\n🎉 Todas las migraciones aplicadas.");
};

main().catch((err) => {
  console.error("Error fatal en runMigrations:", err);
  process.exit(1);
});
