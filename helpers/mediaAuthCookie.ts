import crypto from "crypto";
import authConfig from "../config/auth";

// [P0-E · W1-SEC-02, Opción B] Cookie firmada para servir /public con scope de
// tenant sin romper `<img>` (que no envía Authorization: Bearer). La clave se
// deriva de JWT_SECRET con separación de dominio, así no se exige un env nuevo.
// La cookie es httpOnly+Secure → JS del cliente no la lee ni la puede forjar.
const MEDIA_SECRET = crypto
  .createHash("sha256")
  .update(`${authConfig.secret || ""}:media-cookie:v1`)
  .digest();

export const MEDIA_COOKIE = "media_auth";

const sign = (payload: string): string =>
  crypto.createHmac("sha256", MEDIA_SECRET).update(payload).digest("base64url");

export const buildMediaCookie = (companyId: number, isSuper: boolean): string => {
  const payload = `${companyId}.${isSuper ? 1 : 0}`;
  return `${payload}.${sign(payload)}`;
};

export const verifyMediaCookie = (
  value: string | undefined
): { companyId: number; isSuper: boolean } | null => {
  if (!value || typeof value !== "string") return null;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = value.slice(0, idx);
  const sig = value.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const [cid, sup] = payload.split(".");
  const companyId = Number(cid);
  if (!Number.isFinite(companyId)) return null;
  return { companyId, isSuper: sup === "1" };
};
