// [Plan Fase 2 · Ola A · A3.1] Cifrado de secretos en reposo (tokens Meta).
// Ver spec/modules/marketing-secret-encryption-spec.md
//
// - Algoritmo: AES-256-GCM (autenticado — detecta manipulación).
// - Llave: derivada por scrypt de process.env.ENCRYPTION_KEY (acepta CUALQUIER
//   longitud; la key del proyecto es de 33 chars, no sirve como 32 bytes crudos).
// - Formato: "enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>".
// - RETROCOMPATIBLE: decryptSecret() devuelve el texto plano tal cual si NO tiene
//   el prefijo (passthrough) → migración gradual sin big-bang; encryptSecret() es
//   idempotente (no re-cifra lo ya cifrado).
import crypto from "crypto";

const PREFIX = "enc:v1:";
const ALGO = "aes-256-gcm";
// Sal fija de derivación (la aleatoriedad real vive en el IV por-cifrado).
const KDF_SALT = "chateam-secret-v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error(
      "[secretCrypto] ENCRYPTION_KEY ausente o débil (min 16 chars) — no se puede cifrar."
    );
  }
  cachedKey = crypto.scryptSync(secret, KDF_SALT, 32);
  return cachedKey;
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Huella DETERMINISTA de un secreto, para poder BUSCARLO sin descifrar.
 *
 * [2026-08-01] Nace de un incidente. `encryptSecret` usa un IV aleatorio, así que
 * cifrar dos veces el mismo valor da dos textos distintos — que es justo lo que se
 * quiere de un cifrado, y justo lo que hace imposible un `WHERE token = ?`.
 *
 * Cuando se cifró `Whatsapp.token` (commit bc102f7, 2026-07-26), `tokenAuth` siguió
 * buscando por el valor en claro contra la columna ya cifrada. No encontraba nunca
 * nada y devolvía 403: la API pública entera quedó cerrada seis días sin que nadie lo
 * viera, porque ningún test la ejercitaba.
 *
 * Es HMAC y no un SHA-256 pelado a propósito: sin la clave, quien se lleve un volcado
 * de la base no puede confirmar si un token candidato está ahí. El precio es el mismo
 * que el del cifrado — si cambia ENCRYPTION_KEY, las huellas dejan de coincidir y hay
 * que recalcularlas.
 */
export function hashSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  return crypto.createHmac("sha256", getKey()).update(String(plain)).digest("hex");
}

/** Cifra un secreto. Idempotente (si ya está cifrado lo devuelve igual). Vacío/null → tal cual. */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return (plain as any) ?? null;
  if (isEncrypted(plain)) return plain; // ya cifrado — no re-cifrar
  const iv = crypto.randomBytes(12); // 96-bit nonce recomendado para GCM
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

/** Descifra. Passthrough si NO tiene prefijo (texto plano no migrado). */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null || stored === "") return (stored as any) ?? null;
  if (!isEncrypted(stored)) return stored; // texto plano legacy — passthrough
  try {
    const [, , ivHex, tagHex, ctHex] = stored.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ct = Buffer.from(ctHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString("utf8");
  } catch (err: any) {
    // Fail-closed: no devolver basura. El caller decide (log arriba).
    throw new Error(`[secretCrypto] descifrado falló: ${err.message}`);
  }
}

export default { encryptSecret, decryptSecret, isEncrypted };
