// [Auditoría · Ola 2] Enruta console.* por el logger (pino): unifica formato,
// niveles y timestamp, y aplica la sanitización de secretos/PII (hook de Ola 1)
// también a los console.* existentes. Reemplaza FUNCIONALMENTE el codemod de
// ~2310 console.* sin editar cada sitio (mucho menor riesgo). Idempotente.
//
// Los argumentos OBJETO se pasan como meta a pino (para que el hook los enmascare
// POR CLAVE: access_token/secret/email/phone); strings/números/errores forman el
// mensaje (el hook les aplica el regex de tokens/emails). Así un secreto en una
// clave corta (client_secret, appSecret) también queda enmascarado.
import logger from "./logger";

const split = (args: any[]): [Record<string, any> | undefined, string] => {
  const objs: any[] = [];
  const msgParts: string[] = [];
  for (const a of args) {
    if (a instanceof Error) msgParts.push(a.stack || a.message);
    else if (a !== null && typeof a === "object") objs.push(a);
    else msgParts.push(String(a));
  }
  const meta = objs.length ? Object.assign({}, ...objs) : undefined;
  return [meta, msgParts.join(" ")];
};

const route = (level: "info" | "warn" | "error" | "debug") => (...args: any[]) => {
  const [meta, msg] = split(args);
  if (meta) (logger as any)[level](meta, msg);
  else (logger as any)[level](msg);
};

const g = globalThis as any;
if (!g.__consoleRoutedToPino) {
  g.__consoleRoutedToPino = true;
  /* eslint-disable no-console */
  console.log = route("info");
  console.info = route("info");
  console.warn = route("warn");
  console.error = route("error");
  console.debug = route("debug");
  /* eslint-enable no-console */
}

export {};
