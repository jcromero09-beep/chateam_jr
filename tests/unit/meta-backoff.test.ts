/**
 * Tests unitarios — backoff del cortocircuito de Meta Ads.
 *
 * El cortocircuito existía y estaba bien pensado, pero su TTL era fijo en 1 h y
 * `handleImportInsightsDaily` corre `cron.schedule('0 * * * *')` — también cada
 * hora. Los dos periodos coincidían, así que el bloqueo expiraba justo cuando el
 * cron volvía a disparar: **no ahorraba ni una sola llamada**. En producción se
 * veía como un intento por hora, en punto, indefinidamente, contra una cuenta
 * cuyo permiso no se iba a conceder solo.
 *
 * Estos tests fijan la propiedad que lo arregla, y que es la que importa: el
 * bloqueo tiene que CRECER, para que ningún periodo de cron pueda volver a
 * empatar con él.
 */
import { describe, test, expect } from "@jest/globals";

import { backoffSeconds } from "../../services/MetaMarketingService/index";

const HORA = 3600;

describe("backoffSeconds", () => {
  test("el primer fallo bloquea 1 h", () => {
    expect(backoffSeconds(1)).toBe(HORA);
  });

  test("duplica en cada fallo consecutivo", () => {
    expect(backoffSeconds(2)).toBe(2 * HORA);
    expect(backoffSeconds(3)).toBe(4 * HORA);
    expect(backoffSeconds(4)).toBe(8 * HORA);
    expect(backoffSeconds(5)).toBe(16 * HORA);
  });

  test("tiene techo en 24 h — no crece sin límite", () => {
    expect(backoffSeconds(6)).toBe(24 * HORA);
    expect(backoffSeconds(50)).toBe(24 * HORA);
    expect(backoffSeconds(1000)).toBe(24 * HORA);
  });

  test("nunca devuelve menos que el bloqueo base", () => {
    // Un contador corrupto o en 0 no debe traducirse en "no bloquear".
    expect(backoffSeconds(0)).toBe(HORA);
    expect(backoffSeconds(-5)).toBe(HORA);
  });

  test("desde el 2º fallo, SIEMPRE supera el periodo del cron horario", () => {
    // Esta es la propiedad que arregla el bug: con TTL fijo de 1 h el cron
    // horario caía siempre justo después de expirar. Ahora, a partir del
    // segundo fallo, el bloqueo cubre varias ejecuciones del cron.
    for (let streak = 2; streak <= 10; streak++) {
      expect(backoffSeconds(streak)).toBeGreaterThan(HORA);
    }
  });

  test("un día de fallos son ~5 intentos, no 24", () => {
    // Con el TTL fijo: 24 intentos/día. Con backoff: 1h, 2h, 4h, 8h, 16h ya
    // suman más de un día.
    let acumulado = 0;
    let intentos = 0;
    while (acumulado < 24 * HORA) {
      intentos += 1;
      acumulado += backoffSeconds(intentos);
    }
    expect(intentos).toBeLessThanOrEqual(5);
  });
});
