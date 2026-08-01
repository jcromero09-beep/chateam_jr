#!/usr/bin/env node
/**
 * ci-jest-summary.cjs — convierte el JSON de jest en un resumen markdown para
 * `$GITHUB_STEP_SUMMARY`.
 *
 * ## Por qué existe
 *
 * Cuando un job falla, el detalle vive en los logs del runner, y esos logs piden
 * autenticación aunque el repositorio sea público: la API responde 403 y las
 * anotaciones solo dicen "Process completed with exit code 1". Diagnosticar un fallo
 * del golden-master obligaba a que alguien abriera la web y copiara el log a mano.
 *
 * El step summary, en cambio, se publica con el run y se lee sin credenciales. Con
 * esto, un golden-master en rojo dice QUÉ test cayó y por qué, sin intermediarios.
 *
 * Uso (siempre con `if: always()`, si no, no corre justo cuando hace falta):
 *   npm run test:golden -- --json --outputFile=/tmp/jest.json
 *   node scripts/ci-jest-summary.cjs /tmp/jest.json >> "$GITHUB_STEP_SUMMARY"
 */
const fs = require("fs");

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.log("### Sin resultados de jest");
  console.log("");
  console.log("No existe `" + file + "`: el proceso murió antes de escribirlo.");
  process.exit(0);
}

let r;
try {
  r = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
  console.log("### Resultados de jest ilegibles");
  console.log("");
  console.log("`" + e.message + "`");
  process.exit(0);
}

const total = r.numTotalTests || 0;
const fallidos = r.numFailedTests || 0;
const ok = r.numPassedTests || 0;

console.log("### Golden-master: " + ok + "/" + total + " · " + fallidos + " fallo(s)");
console.log("");

if (!fallidos) {
  console.log("Todos los tests pasaron.");
  process.exit(0);
}

const limpio = s => (s || "").replace(/\x1b?\[[0-9;]*m/g, "");
const corto = p => String(p).replace(/^.*\/tests\//, "tests/");

for (const suite of r.testResults || []) {
  const caidos = (suite.assertionResults || []).filter(a => a.status === "failed");
  if (!caidos.length) continue;
  console.log("<details open><summary><code>" + corto(suite.name) + "</code></summary>");
  console.log("");
  for (const a of caidos) {
    console.log("**" + a.fullName + "**");
    console.log("");
    console.log("```");
    console.log(limpio((a.failureMessages || []).join("\n")).split("\n").slice(0, 30).join("\n"));
    console.log("```");
    console.log("");
  }
  console.log("</details>");
  console.log("");
}

// Un fallo del propio runner (no de un test) no aparece en assertionResults.
const rotas = (r.testResults || []).filter(
  s => s.status === "failed" && !(s.assertionResults || []).some(a => a.status === "failed")
);
for (const s of rotas) {
  console.log("**Suite que no llegó a ejecutarse:** `" + corto(s.name) + "`");
  console.log("");
  console.log("```");
  console.log(limpio(s.message).split("\n").slice(0, 25).join("\n"));
  console.log("```");
  console.log("");
}
