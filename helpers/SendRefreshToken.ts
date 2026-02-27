// src/helpers/SendRefreshToken.ts
import { Response } from "express";

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_NAME = "jrt";
const COOKIE_PATH = "/"; // <-- path root para que se envíe en todas las rutas /api

/**
 * Si token viene definido => escribe cookie.
 * Si token es undefined => BORRA el cookie (no lo escribe como "null").
 */
export function SendRefreshToken(res: Response, token?: string): void {
  const base = {
    httpOnly: true as const,
    secure: IS_PROD,
    sameSite: "lax" as const,
    path: COOKIE_PATH
    // IMPORTANTE: NO pongas "domain" aquí porque tu cookie es host-only
  };

  if (token) {
    res.cookie(COOKIE_NAME, token, {
      ...base,
      maxAge: 1000 * 60 * 60 * 24 * 30 // 30 días (ajusta si quieres)
    });
    return;
  }

  // Borrado robusto: clearCookie + sobrescritura expirada
  res.clearCookie(COOKIE_NAME, base);
  res.cookie(COOKIE_NAME, "", { ...base, expires: new Date(0) });
}

export default SendRefreshToken;
