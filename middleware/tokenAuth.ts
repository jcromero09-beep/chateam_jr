import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import Whatsapp from "../models/Whatsapp";
import FindWhatsappByApiToken from "../services/WhatsappService/FindWhatsappByApiToken";
import logger from "../utils/logger";
import { updateTraceContext } from "../utils/traceContext";

/**
 * `METHOD /ruta` con los segmentos variables colapsados a `:id`.
 *
 * En este middleware `req.route` todavía no está resuelto, así que se parte de
 * la ruta cruda. Sin normalizar, el inventario del modo `observe` tendría una
 * entrada por cada id y dejaría de ser legible; con ids colapsados hay una
 * entrada por endpoint, que es la unidad de la decisión.
 *
 * Se usa `req.path` (no `originalUrl`): la query string puede llevar datos.
 */
const normalizeRoute = (req: Request): string => {
  const path = (req.path || "/")
    .split("/")
    .map(seg => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return ":id";
      if (seg.length >= 16 && /^[a-f0-9-]+$/i.test(seg)) return ":id";
      return seg;
    })
    .join("/");
  return `${req.method} ${path}`;
};

/**
 * Contador de tráfico de la superficie `api`.
 *
 * ## Por qué hace falta
 *
 * El guard de tenant lleva esta superficie en modo `observe` y en 22 h de
 * producción no registró **ni una** query sin filtrar. Ese resultado es
 * **ambiguo**: puede significar "todo lo que pasó ya venía scopeado" o "no pasó
 * nada". No hay log de acceso HTTP que lo distinga, y de esa distinción depende
 * si tiene sentido pasar `TENANT_SCOPE_GUARD_API` a `enforce`:
 *
 *   - Tráfico > 0 y 0 hallazgos  → la superficie está limpia, enforce es seguro.
 *   - Tráfico = 0                → no se ha probado nada; enforce es un salto a
 *                                  ciegas sobre endpoints que quizá nadie usa.
 *
 * Se cuenta en memoria y se vuelca cada `API_SURFACE_SUMMARY_MS` (default 10
 * min) solo si hubo tráfico, igual que el inventario de helpers/tenantScope: un
 * log por request en `/api/send` sería un incidente de logs por sí mismo.
 */
const API_SURFACE_SUMMARY_MS = Number(
  process.env.API_SURFACE_SUMMARY_MS || 10 * 60 * 1000
);

const apiSurfaceHits = new Map<string, number>();
let apiSurfaceTimer: NodeJS.Timeout | undefined;

/** Tráfico acumulado por ruta, de más a menos. Para tests y diagnóstico. */
export const getApiSurfaceHits = (): Array<{ route: string; count: number }> =>
  [...apiSurfaceHits.entries()]
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count);

export const resetApiSurfaceHits = (): void => {
  apiSurfaceHits.clear();
};

const recordApiSurfaceRequest = (route: string): void => {
  apiSurfaceHits.set(route, (apiSurfaceHits.get(route) || 0) + 1);

  if (apiSurfaceTimer) return;
  apiSurfaceTimer = setInterval(() => {
    const hits = getApiSurfaceHits();
    if (!hits.length) return;
    logger.info(
      { total: hits.reduce((n, h) => n + h.count, 0), routes: hits },
      "[apiSurface] tráfico por la API pública (tokenAuth) — contexto para el guard de tenant"
    );
  }, API_SURFACE_SUMMARY_MS);
  // unref: este contador nunca debe mantener el proceso vivo.
  apiSurfaceTimer.unref?.();
};

const isAuthApi = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const [, token] = authHeader.split(" ");

  let whatsapp: Whatsapp | null = null;
  try {
    // [Ola bugs 2026-07] Se eliminaron 3 console.log que volcaban el API-token de
    // Whatsapp en claro (aquí, en el getToken y en el catch). Mismo tipo de fuga que
    // la Ola de secretos en logs.
    // [2026-08-01 · incidente] Antes: `findOne({ where: { token } })` con el valor
    // en claro. Desde que el campo se cifra (bc102f7, 26-07) esa consulta NO PUEDE
    // encontrar nada —el cifrado usa IV aleatorio, así que el texto guardado nunca
    // coincide con el que manda el cliente— y el catch de abajo lo convertía en 403.
    // La API pública llevaba seis días rechazando a todo el mundo.
    //
    // Se busca por la huella determinista, que el setter del modelo mantiene.
    whatsapp = await FindWhatsappByApiToken(token);

    const getToken = whatsapp?.token;
    if (!getToken) {
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }
  } catch (err) {
    throw new AppError(
      "Invalid token. We'll try to assign a new one on next request, tokenauth",
      403

    );
  }

  // [W1-SEC-IDOR] Propagar la empresa dueña del token al AsyncLocalStorage.
  // Sin esto, applyScope salía en `ctx.companyId == null` y el guard de tenant
  // quedaba INERTE en toda la API pública: estos endpoints dependían al 100% de
  // que cada servicio filtrase a mano. Arranca en modo 'observe' para esta
  // superficie (ver TENANT_SCOPE_GUARD_API en helpers/tenantScope).
  // [2026-08-01] La conexión viaja en el request para que los handlers no repitan
  // la consulta. La duplicación no era solo trabajo de más: cuando el token pasó a
  // guardarse cifrado, middleware y handlers dejaron de encontrarlo cada uno por su
  // lado y respondían códigos distintos al mismo cliente. Además, la búsqueda del
  // handler corre con el contexto de tenant ya abierto, así que el guard de
  // aislamiento la veía como una consulta sin filtro de empresa — un aviso que no
  // señalaba nada que arreglar y que bloqueaba el paso a `enforce`.
  req.apiWhatsapp = whatsapp ?? undefined;

  if (whatsapp?.companyId != null) {
    const route = normalizeRoute(req);
    recordApiSurfaceRequest(route);
    updateTraceContext({
      companyId: whatsapp.companyId,
      tenantSurface: "api",
      tenantRoute: route
    });
  }

  return next();
};

export default isAuthApi;
