/**
 * Tests unitarios — higiene de logs.
 *
 * Los dos arreglos que salieron del triaje de logs del 2026-07-30, y que son
 * fáciles de deshacer sin querer:
 *
 *  1. Los avisos del runtime no son errores, y no se repiten 1.088 veces.
 *  2. Un token no se identifica exponiendo sus primeros caracteres.
 */
import { describe, test, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

import { tokenFingerprint } from "../../utils/tokenFingerprint";

describe("tokenFingerprint", () => {
  const TOKEN =
    "EAAM2fltLUkoBQzZBgkiZCabcdefghijklmnopqrstuvwxyz0123456789ZDZD";

  test("no filtra NINGÚN fragmento del token", () => {
    const out = tokenFingerprint(TOKEN);
    // El patrón viejo era `token.substring(0, 20) + "..."`. Ese prefijo no debe
    // aparecer, ni el sufijo que también se logueaba.
    expect(out).not.toContain(TOKEN.substring(0, 20));
    expect(out).not.toContain(TOKEN.slice(-10));
    expect(out).not.toContain(TOKEN);
  });

  test("sirve para lo que se usaba: ¿está puesto? ¿es el mismo?", () => {
    expect(tokenFingerprint(null)).toBe("NOT SET");
    expect(tokenFingerprint(undefined)).toBe("NOT SET");
    expect(tokenFingerprint("")).toBe("NOT SET");

    // Mismo token → misma huella (permite ver si cambió entre reinicios).
    expect(tokenFingerprint(TOKEN)).toBe(tokenFingerprint(TOKEN));
    // Token distinto → huella distinta.
    expect(tokenFingerprint(TOKEN)).not.toBe(tokenFingerprint(TOKEN + "x"));
  });

  test("incluye la longitud — distingue un token real de uno truncado", () => {
    expect(tokenFingerprint(TOKEN)).toContain(`len=${TOKEN.length}`);
  });
});

describe("avisos del runtime", () => {
  /* eslint-disable @typescript-eslint/no-var-requires, global-require */
  const load = () => {
    jest.resetModules();
    const mod = require("../../utils/processWarnings");
    const logger = require("../../utils/logger").default;
    logger.warn.mockClear();
    logger.error.mockClear();
    mod.resetProcessWarnings();
    return { mod, logger };
  };
  /* eslint-enable @typescript-eslint/no-var-requires, global-require */

  beforeEach(() => {
    (globalThis as any).__processWarningsRouted = undefined;
  });

  test("un aviso repetido N veces se loguea UNA, con contador N", () => {
    const { mod, logger } = load();
    const w = {
      name: "DeprecationWarning",
      code: "DEP0174",
      message: "Calling promisify on a function that returns a Promise"
    };
    for (let i = 0; i < 50; i++) mod.recordWarning(w);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    const inv = mod.getProcessWarnings();
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ name: "DeprecationWarning", code: "DEP0174", count: 50 });
  });

  test("NO se loguea como error — ese era el problema entero", () => {
    const { mod, logger } = load();
    mod.recordWarning({ name: "DeprecationWarning", code: "DEP0174", message: "x" });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  test("avisos distintos son entradas distintas", () => {
    const { mod } = load();
    mod.recordWarning({ name: "DeprecationWarning", code: "DEP0174", message: "a" });
    mod.recordWarning({ name: "DeprecationWarning", code: "DEP0175", message: "b" });
    mod.recordWarning({ name: "MaxListenersExceededWarning", message: "c" });
    expect(mod.getProcessWarnings()).toHaveLength(3);
  });

  test("la primera vez lleva la traza — es lo único que localiza el origen", () => {
    const { mod, logger } = load();
    mod.recordWarning({ name: "DeprecationWarning", message: "x", stack: "AQUI-LA-TRAZA" });
    const meta = logger.warn.mock.calls[0][0] as any;
    expect(meta.stack).toBe("AQUI-LA-TRAZA");
  });

  test("se desengancha el handler por defecto de Node", () => {
    // Si no se quita, sigue escribiendo por console.error (que consoleToLogger
    // enruta a logger.error) EN PARALELO al nuestro, y el ruido no baja.
    const before = process.listenerCount("warning");
    load();
    expect(process.listenerCount("warning")).toBeLessThanOrEqual(
      Math.max(before, 1)
    );
    expect(process.listenerCount("warning")).toBe(1);
  });
});
