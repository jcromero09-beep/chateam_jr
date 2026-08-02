/**
 * Comprueba que los `import { x } from "paquete"` del código FUNCIONAN al arrancar.
 *
 *     node --import tsx/esm --require tsx/cjs scripts/checkEsmNamedImports.ts
 *
 * ## Por qué existe
 *
 * [2026-08-01] Un despliegue tumbó producción con:
 *
 *     SyntaxError: The requested module 'lodash' does not provide an export
 *     named 'isNil'
 *
 * El proyecto es `"type": "module"`, así que los `.ts` se cargan como ESM. Importar
 * nombres sueltos de un paquete CommonJS solo funciona si Node consigue deducirlos
 * analizando el fichero (cjs-module-lexer). Eso depende de CÓMO esté escrito el
 * paquete, así que una subida de versión —aunque sea de parche— puede romperlo.
 *
 * Los tests no lo detectan: jest corre en CommonJS con ts-jest, donde ese mismo
 * import se convierte en `require(...)` y siempre funciona. El único sitio donde
 * falla es el arranque real, y ahí ya es tarde.
 *
 * Este script importa de verdad cada paquete, con el mismo cargador que usa PM2.
 * Salir con 0 significa que el arranque no va a morir por esto.
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { transformSync } from "esbuild";

// Ni `__dirname` (no existe en ESM) ni `import.meta.url` (no existe si el fichero
// acaba cargándose como CJS): con `--import tsx/esm --require tsx/cjs` puede pasar
// cualquiera de las dos cosas, así que la raíz se pregunta a git.
const RAIZ = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();

/**
 * Ficheros que carga el proceso del servidor.
 *
 * Fuera: tests y scripts (no arrancan con la app), `.d.ts` (solo declaraciones) y
 * `frontend/` — ese código lo compila Vite para el navegador y sus dependencias
 * (react, vite, sonner…) ni siquiera están instaladas aquí. Incluirlo llenaba el
 * informe de "NO CARGA" que no significan nada, y un informe con ruido no se lee.
 */
function ficherosFuente(): string[] {
  const salida = execSync(
    "git ls-files '*.ts' ':!tests' ':!scripts' ':!frontend' ':!*.d.ts'",
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  return salida.split("\n").filter(Boolean);
}

/**
 * `import { a, b as c } from "paquete"` → { paquete: Set<a, b> }
 *
 * Solo paquetes de node_modules: los imports relativos son ficheros del proyecto y
 * los compila tsx, así que nunca dan este error.
 *
 * El fichero se pasa ANTES por esbuild —el mismo compilador que usa tsx— porque los
 * imports de TIPOS desaparecen al compilar y nunca pueden romper el arranque. Sin
 * este paso el informe salía lleno de `sequelize · no expone "WhereOptions"` y
 * similares: ciertos como observación y completamente irrelevantes, que es la peor
 * combinación posible para una herramienta que avisa de problemas.
 *
 * Basta con mirar la salida y no hace falta distinguir `import type` a mano: esbuild
 * ya elimina también los nombres que solo se usan en posición de tipo.
 */
function importsNombrados(): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const re = /import\s+(?!type\s)\{([^}]+)\}\s+from\s+["']([^"'.][^"']*)["']/g;

  for (const f of ficherosFuente()) {
    const crudo = fs.readFileSync(path.join(RAIZ, f), "utf8");
    let src: string;
    try {
      src = transformSync(crudo, { loader: "ts", format: "esm" }).code;
    } catch {
      // Un fichero que ni compila es problema de otro gate (type-check). Aquí se
      // salta en vez de tumbar la comprobación entera.
      continue;
    }
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(src))) {
      const [, nombres, paquete] = m;
      // Subrutas como "date-fns/locale" se resuelven aparte; se conservan tal cual.
      if (!mapa.has(paquete)) mapa.set(paquete, new Set());
      for (const n of nombres.split(",")) {
        const limpio = n.trim().split(/\s+as\s+/)[0].trim();
        if (limpio && limpio !== "type" && !limpio.startsWith("type ")) {
          mapa.get(paquete)!.add(limpio);
        }
      }
    }
  }
  return mapa;
}

/**
 * Paquetes que pueden faltar sin que pase nada.
 *
 * Van con su motivo a propósito: la lista es la puerta de atrás de esta
 * comprobación, y una entrada sin justificar es una forma cómoda de silenciar un
 * fallo de verdad.
 */
const OPCIONALES: Record<string, string> = {
  "@aws-sdk/client-ses":
    "proveedor de email opcional. ProviderFactory lo carga con import() dentro de " +
    "try/catch y avisa 'Instale @aws-sdk/client-ses' si no está; no se importa al " +
    "arrancar, así que su ausencia no tumba el proceso."
};

async function main() {
  const mapa = importsNombrados();
  console.log(`Paquetes con imports nombrados: ${mapa.size}`);

  const rotos: string[] = [];
  let comprobados = 0;

  for (const [paquete, nombres] of [...mapa.entries()].sort()) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(paquete)) as Record<string, unknown>;
    } catch (err) {
      if (OPCIONALES[paquete]) {
        console.log(`  (omitido) ${paquete}: ${OPCIONALES[paquete]}`);
        continue;
      }
      // Un paquete que ni siquiera carga es otro problema (falta, o peta al
      // importarse). Se reporta, pero distinguido de "carga pero le falta un nombre".
      const motivo = err instanceof Error ? err.message.split("\n")[0] : String(err);
      rotos.push(`${paquete} · NO CARGA: ${motivo}`);
      continue;
    }
    comprobados += 1;

    // El interop de Node deja el objeto CJS en `default`. Un nombre vale si está en
    // cualquiera de los dos sitios: así es como lo resolvería el import real.
    const dflt = mod.default;
    for (const n of nombres) {
      const enModulo = n in mod;
      const enDefault = dflt != null && typeof dflt === "object" && n in dflt;
      if (!enModulo && !enDefault) {
        rotos.push(`${paquete} · no expone "${n}"`);
      }
    }
  }

  console.log(`Comprobados: ${comprobados}`);
  if (rotos.length) {
    console.error(`\nFALLA · ${rotos.length} imports que el arranque no resolvería:`);
    rotos.forEach(r => console.error("  " + r));
    console.error(
      "\nEsto es lo que mata el proceso al arrancar. Si aparece tras cambiar\n" +
        "dependencias, el culpable es la subida de versión de ese paquete."
    );
    process.exit(1);
  }
  console.log("\nOK · todos los imports nombrados se resuelven.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
