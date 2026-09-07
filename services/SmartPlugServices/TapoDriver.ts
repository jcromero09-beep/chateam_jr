/**
 * Service: TapoDriver
 * Adaptador de bajo nivel sobre `tp-link-tapo-connect` (v2.x).
 *
 * Responsabilidades:
 *  - abrir y CACHEAR la sesion local contra la toma (el handshake KLAP es caro),
 *  - reintentar UNA vez con sesion nueva cuando la cacheada expira,
 *  - acotar toda llamada con timeout (la toma vive en la LAN del cliente y una
 *    IP muerta cuelga el socket sin devolver nunca),
 *  - normalizar la respuesta cruda del dispositivo a tipos del dominio.
 *
 * Por que import dinamico: el paquete se resuelve la primera vez que se opera
 * una toma, no al levantar el proceso. Si la dependencia no esta instalada, el
 * backend arranca igual y solo fallan los endpoints de tomas con un error
 * explicito, en vez de tumbar el boot entero por un import roto.
 */

import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import type { SmartPlugEnergy } from "../../models/SmartPlug";
import { errorText } from "./smartPlugUtils";

// --- Superficie del paquete que realmente usamos --------------------------
// Se declara local a proposito: importar los tipos del paquete obligaria a
// tenerlo instalado para que `tsc` compile.

interface TapoDeviceInfoRaw {
  device_id?: string;
  model?: string;
  type?: string;
  mac?: string;
  nickname?: string;
  device_on?: boolean;
  on_time?: number;
  overheated?: boolean;
  ip?: string;
  ssid?: string;
  signal_level?: number;
  rssi?: number;
  fw_ver?: string;
  hw_ver?: string;
}

interface TapoEnergyUsageRaw {
  current_power?: number; // miliwatts
  today_energy?: number; // Wh
  month_energy?: number; // Wh
  today_runtime?: number; // minutos
  month_runtime?: number; // minutos
  local_time?: string;
}

interface TapoDeviceHandle {
  turnOn: (deviceId?: string) => Promise<void>;
  turnOff: (deviceId?: string) => Promise<void>;
  getDeviceInfo: () => Promise<TapoDeviceInfoRaw>;
  getEnergyUsage: () => Promise<TapoEnergyUsageRaw>;
}

type LoginDeviceByIp = (
  email: string,
  password: string,
  deviceIp: string
) => Promise<TapoDeviceHandle>;

// --- Tipos del dominio ----------------------------------------------------

export interface TapoPlugInfo {
  vendorDeviceId?: string;
  model?: string;
  macAddress?: string;
  nickname?: string;
  relayOn: boolean;
  onTimeSeconds?: number;
  overheated?: boolean;
  ip?: string;
  ssid?: string;
  signalLevel?: number;
  rssi?: number;
  firmwareVersion?: string;
  hardwareVersion?: string;
}

export interface TapoConnectionTarget {
  plugId: number;
  host: string;
  email: string;
  password: string;
}

// --- Configuracion --------------------------------------------------------

// Vida de una sesion cacheada. TP-Link no documenta el TTL real del token;
// 10 min es conservador y el reintento cubre la expiracion temprana.
const SESSION_TTL_MS = 10 * 60 * 1000;

// Una toma sana en LAN responde en decenas de ms. 8 s ya es una toma caida.
const OPERATION_TIMEOUT_MS = 8000;

// --- Carga diferida del paquete -------------------------------------------

let loginDeviceByIpFn: LoginDeviceByIp | null = null;

const getLoginDeviceByIp = async (): Promise<LoginDeviceByIp> => {
  if (loginDeviceByIpFn) return loginDeviceByIpFn;

  let mod: Record<string, unknown>;
  try {
    mod = (await import("tp-link-tapo-connect")) as unknown as Record<string, unknown>;
  } catch (err: unknown) {
    logger.error(`[TapoDriver] No se pudo cargar tp-link-tapo-connect: ${errorText(err)}`);
    throw new AppError("ERR_SMART_PLUG_DRIVER_UNAVAILABLE", 503);
  }

  // El paquete es CommonJS: al importarlo desde ESM los named exports pueden
  // quedar colgando de `default` en vez del namespace. Se cubren ambos.
  const ns = mod as { default?: Record<string, unknown> };
  const candidate =
    (mod.loginDeviceByIp as LoginDeviceByIp | undefined) ??
    (ns.default?.loginDeviceByIp as LoginDeviceByIp | undefined);

  if (typeof candidate !== "function") {
    logger.error("[TapoDriver] tp-link-tapo-connect no expone loginDeviceByIp");
    throw new AppError("ERR_SMART_PLUG_DRIVER_UNAVAILABLE", 503);
  }

  loginDeviceByIpFn = candidate;
  return loginDeviceByIpFn;
};

// --- Cache de sesiones ----------------------------------------------------

interface CachedSession {
  handle: TapoDeviceHandle;
  host: string;
  expiresAt: number;
}

const sessions = new Map<number, CachedSession>();

/** Descarta la sesion cacheada de una toma (cambio de IP, credencial o error). */
export const invalidateSession = (plugId: number): void => {
  sessions.delete(plugId);
};

const openSession = async (target: TapoConnectionTarget): Promise<TapoDeviceHandle> => {
  const loginByIp = await getLoginDeviceByIp();
  const handle = await withTimeout(
    loginByIp(target.email, target.password, target.host),
    `login ${target.host}`
  );
  sessions.set(target.plugId, {
    handle,
    host: target.host,
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return handle;
};

/**
 * Hay sesion reutilizable? El host cacheado tiene que coincidir: si la toma
 * cambio de IP en el DHCP, la sesion vieja apunta a un equipo que ya no es este.
 */
const hasValidSession = (target: TapoConnectionTarget): boolean => {
  const cached = sessions.get(target.plugId);
  return !!cached && cached.host === target.host && cached.expiresAt > Date.now();
};

const getSession = async (target: TapoConnectionTarget): Promise<TapoDeviceHandle> => {
  if (hasValidSession(target)) {
    return sessions.get(target.plugId)!.handle;
  }
  return openSession(target);
};

// --- Utilidades -----------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout de ${OPERATION_TIMEOUT_MS}ms en ${label}`));
    }, OPERATION_TIMEOUT_MS);

    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Ejecuta una operacion sobre la toma. Si falla con la sesion cacheada,
 * reintenta UNA vez con sesion nueva — el caso normal es token expirado, que
 * es indistinguible de un error de red hasta que se reintenta.
 */
const runWithSession = async <T>(
  target: TapoConnectionTarget,
  operation: (handle: TapoDeviceHandle) => Promise<T>,
  label: string
): Promise<T> => {
  // Solo tiene sentido reintentar si REALMENTE se reuso una sesion cacheada:
  // si el login fue nuevo, el fallo es real y repetirlo solo duplica la espera.
  const reusedCachedSession = hasValidSession(target);

  try {
    const handle = await getSession(target);
    return await withTimeout(operation(handle), `${label} ${target.host}`);
  } catch (firstError: unknown) {
    invalidateSession(target.plugId);

    // Sin sesion previa no hay nada que refrescar: el fallo es real.
    if (!reusedCachedSession) throw firstError;

    logger.warn(
      `[TapoDriver] ${label} fallo con sesion cacheada (plug=${target.plugId}): ` +
      `${errorText(firstError)}. Reintentando con sesion nueva.`
    );

    const handle = await openSession(target);
    return withTimeout(operation(handle), `${label} ${target.host} (reintento)`);
  }
};

// --- Normalizacion --------------------------------------------------------

const toPlugInfo = (raw: TapoDeviceInfoRaw): TapoPlugInfo => ({
  vendorDeviceId: raw.device_id,
  model: raw.model,
  macAddress: raw.mac,
  nickname: raw.nickname, // el paquete ya lo decodifica de base64
  relayOn: raw.device_on === true,
  onTimeSeconds: raw.on_time,
  overheated: raw.overheated,
  ip: raw.ip,
  ssid: raw.ssid,
  signalLevel: raw.signal_level,
  rssi: raw.rssi,
  firmwareVersion: raw.fw_ver,
  hardwareVersion: raw.hw_ver
});

const toEnergy = (raw: TapoEnergyUsageRaw): SmartPlugEnergy => ({
  currentPowerMw: raw.current_power,
  todayEnergyWh: raw.today_energy,
  monthEnergyWh: raw.month_energy,
  todayRuntimeMin: raw.today_runtime,
  monthRuntimeMin: raw.month_runtime,
  readAt: new Date().toISOString()
});

// --- API publica del driver ----------------------------------------------

/**
 * Sonda de un solo uso, SIN cache: abre sesion, lee y descarta.
 * Se usa antes de que la toma exista en BD (no hay id con el cual cachear) y
 * para el endpoint de prueba de credenciales.
 */
export const probeDevice = async (
  host: string,
  email: string,
  password: string
): Promise<TapoPlugInfo> => {
  const loginByIp = await getLoginDeviceByIp();
  const handle = await withTimeout(loginByIp(email, password, host), `login ${host}`);
  const raw = await withTimeout(handle.getDeviceInfo(), `probe ${host}`);
  return toPlugInfo(raw);
};

export const getDeviceInfo = async (target: TapoConnectionTarget): Promise<TapoPlugInfo> => {
  const raw = await runWithSession(target, h => h.getDeviceInfo(), "getDeviceInfo");
  return toPlugInfo(raw);
};

export const setRelay = async (
  target: TapoConnectionTarget,
  on: boolean
): Promise<void> => {
  await runWithSession(
    target,
    h => (on ? h.turnOn() : h.turnOff()),
    on ? "turnOn" : "turnOff"
  );
};

/**
 * Consumo instantaneo y acumulado. Solo los modelos con medicion (P110/P115)
 * responden; en P100/P105 el dispositivo rechaza el metodo y devolvemos null
 * en vez de propagar el error — no tener medicion no es una falla.
 */
export const getEnergyUsage = async (
  target: TapoConnectionTarget
): Promise<SmartPlugEnergy | null> => {
  try {
    const raw = await runWithSession(target, h => h.getEnergyUsage(), "getEnergyUsage");
    if (!raw || typeof raw !== "object") return null;
    return toEnergy(raw);
  } catch (err: unknown) {
    logger.info(
      `[TapoDriver] Sin medicion de consumo para plug=${target.plugId} (${target.host}): ` +
      `${errorText(err)}`
    );
    return null;
  }
};

export default { getDeviceInfo, setRelay, getEnergyUsage, probeDevice, invalidateSession };
