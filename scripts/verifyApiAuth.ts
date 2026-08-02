/**
 * Comprueba contra el servidor VIVO que la API pública autentica.
 *
 *     node scripts/withPm2Env.cjs npx tsx scripts/verifyApiAuth.ts
 *     node scripts/withPm2Env.cjs npx tsx scripts/verifyApiAuth.ts --todas
 *
 * La aserción es: un token válido NO puede recibir 401 ni 403. Esos son los códigos
 * del portero; cualquier otro significa que la petición pasó la autenticación y
 * quien responde ya es el handler.
 *
 * [2026-08-01] Nace del incidente en que la API estuvo seis días devolviendo 403 a
 * todo el mundo. Dos cosas que costaron y por eso están fijadas aquí:
 *
 *   - La ruta real es `/api/messages/checkNumber`. Contra `/api/...` todo da 404, y
 *     un 404 no es 401 ni 403 — o sea, pasaría por bueno sin haber probado nada.
 *   - Se comprueban los dos controles negativos ANTES que nada. Si "sin cabecera" no
 *     da 401, el que está mal es el test, no el servidor, y el resto no vale.
 *
 * No imprime tokens ni fragmentos.
 */
import "../bootstrap";
import sequelize from "../database";
import Whatsapp from "../models/Whatsapp";

const BASE = process.env.VERIFY_BASE_URL || "http://127.0.0.1:3010";
const todas = process.argv.includes("--todas");
const MUESTRA = 3;

async function pedir(token: string | null): Promise<number> {
  const res = await fetch(`${BASE}/api/messages/checkNumber`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ number: "593999999999" })
  });
  return res.status;
}

async function main() {
  console.log(`Servidor: ${BASE}`);

  const sinCabecera = await pedir(null);
  const inexistente = await pedir("no-existe-este-token");
  console.log(`  sin cabecera      → ${sinCabecera}  (401 esperado)`);
  console.log(`  token inexistente → ${inexistente}  (403 esperado)`);

  if (sinCabecera !== 401 || inexistente !== 403) {
    console.error(
      "\nLos controles negativos no dan lo esperado. Antes de mirar nada más, revisar\n" +
        "que la RUTA sea la correcta: si no existe, todo responde 404 y esta prueba no\n" +
        "mide nada."
    );
    process.exit(2);
  }

  const conexiones = await Whatsapp.findAll({
    attributes: ["id", "name", "companyId", "token", "tokenHash"],
    order: [["id", "ASC"]]
  });
  const conToken = conexiones.filter(w => w.token);
  const aProbar = todas ? conToken : conToken.slice(0, MUESTRA);

  console.log(
    `\nConexiones con token: ${conToken.length} · se prueban ${aProbar.length}` +
      (todas ? "" : " (--todas para el resto)")
  );

  const rechazadas: string[] = [];
  for (const w of aProbar) {
    const code = await pedir(w.token);
    const pasa = code !== 401 && code !== 403;
    if (!pasa) rechazadas.push(`#${w.id} ${w.name} (company ${w.companyId}) → ${code}`);
    console.log(`  #${w.id} ${w.name} → ${code}  ${pasa ? "autentica" : "RECHAZADO"}`);
  }

  // Filas sin huella: no las rechazaría el middleware por estar mal, sino por no
  // haber pasado el backfill. Se avisa aparte porque el arreglo es otro.
  const sinHuella = conToken.filter(w => !w.tokenHash);
  if (sinHuella.length) {
    console.log(
      `\nAVISO · ${sinHuella.length} conexiones con token pero SIN tokenHash. ` +
        "Falta correr scripts/backfillTokenHash.ts: sus integraciones seguirán con 403."
    );
    sinHuella.forEach(w => console.log(`    #${w.id} ${w.name} (company ${w.companyId})`));
  }

  await sequelize.close();

  if (rechazadas.length) {
    console.error(`\nFALLA · ${rechazadas.length} conexiones rechazadas.`);
    process.exit(1);
  }
  console.log("\nOK · ninguna conexión recibe 401 ni 403.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
