// [Plan Fase 2 · Ola A · A3.1] Transformador de migración: cifra tokens Meta.
// Usa el MISMO helper secretCrypto que los getters del modelo (fuente única).
//
// Uso (pipeline con docker psql, sin plano en disco):
//   MODE=encrypt|decrypt  lee de STDIN líneas "TABLE\tID\tVALUE" y emite UPDATEs.
//
// Ej:
//   docker exec -i pg psql -Atc "SELECT 'Whatsapps',id,\"tokenMeta\" FROM ..." \
//     | MODE=encrypt node --import tsx/esm scripts/encrypt-meta-tokens.ts \
//     | docker exec -i pg psql -d chateamjr
import "dotenv/config";
import { encryptSecret, decryptSecret, isEncrypted } from "../helpers/secretCrypto";

const MODE = process.env.MODE === "decrypt" ? "decrypt" : "encrypt";
const COLS: Record<string, string> = { Whatsapps: "tokenMeta", CompaniesSettings: "facebookSystemUserToken" };
const sqlEsc = (s: string) => s.replace(/'/g, "''");

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => (buf += d));
process.stdin.on("end", () => {
  let n = 0, skip = 0, fail = 0;
  for (const line of buf.split("\n")) {
    if (!line.trim()) continue;
    const [table, id, ...rest] = line.split("|"); // psql -A -F'|'
    const val = rest.join("|");
    const col = COLS[table];
    if (!col || !id || val == null || val === "") { skip++; continue; }
    try {
      if (MODE === "encrypt") {
        if (isEncrypted(val)) { skip++; continue; }
        const enc = encryptSecret(val)!;
        if (decryptSecret(enc) !== val) throw new Error("round-trip mismatch");
        process.stdout.write(`UPDATE "${table}" SET "${col}"='${sqlEsc(enc)}' WHERE id=${Number(id)};\n`);
        n++;
      } else {
        if (!isEncrypted(val)) { skip++; continue; }
        const plain = decryptSecret(val)!;
        process.stdout.write(`UPDATE "${table}" SET "${col}"='${sqlEsc(plain)}' WHERE id=${Number(id)};\n`);
        n++;
      }
    } catch (e: any) { fail++; process.stderr.write(`  ❌ ${table}#${id}: ${e.message}\n`); }
  }
  process.stderr.write(`[encrypt-meta-tokens] modo=${MODE} · ${n} UPDATEs · ${skip} saltados · ${fail} fallidos\n`);
});
