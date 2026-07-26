# W0-INV-08 — Cobertura de tests (intento acotado)

> Ola 0 (INV) · 2026-07-24 · Ejecución **autorizada** de tests, acotada por seguridad del NAS: solo
> `tests/unit`, `nice -n 19`, `--maxWorkers=1`, timeout 300s. Load del NAS al inicio: **6.84 / 4 cores**
> (saturado) → se evitó deliberadamente la suite completa y los e2e (que golpean padeldev en vivo).

## Resultado: la suite unit NO completa → cobertura NO OBTENIBLE (bloqueada por tooling)

- **9 suites unit PASAN** limpias antes del crash: `ticket`, `auth`, `schedule-resolve-ticket-id`,
  `schedule-create-service`, `create-queue-service`, `ugc-pipeline-run-billing`,
  `ai-credits/provision-credits`, `ai-credits/deduct-credits`,
  `ai-credits/credit-transactions-controller`.
- **Crash del runner** en `tests/unit/meta-official-mcp.test.ts:111` → carga
  `services/AIAgentServices/MetaOfficialMCPService.ts` → `@modelcontextprotocol/sdk/src/client/auth.ts`
  con **`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`**. El MCP SDK se importa desde su fuente `.ts` con
  dynamic `import()` que ts-jest (sin el flag de VM modules) no puede resolver → aborta la corrida
  antes del resumen/cobertura.
- Los `ERR_AI_CREDIT_*`/`ERR_AI_INSUFFICIENT_CREDITS` en el log son **aserciones esperadas** de los
  tests de créditos (que PASARON), no fallos.

## Clasificación
- **Cobertura % = NO VERIFICABLE** hoy: no se puede medir hasta arreglar el runner (config
  ts-jest/ESM + `transformIgnorePatterns` para el MCP SDK, o mockear `MetaOfficialMCPService`).
- Confirma y **concreta** el hallazgo de `qa.md` ("CI roto"): además del `db:migrate` sin build, hay un
  **crash de carga por ESM** que impide la suite completa.

## Impacto en el plan
- **W6-INFRA-02 (arreglar CI)** gana un blocker concreto: resolver `ERR_VM_DYNAMIC_IMPORT_CALLBACK_
  MISSING_FLAG` del MCP SDK en jest (flag `--experimental-vm-modules` o mock).
- La cobertura sigue como **INV abierto** (no como número), dependiente de W6-INFRA-02.

## Nota de seguridad operativa
No se ejecutó la suite completa ni los e2e/integration por la saturación del NAS (evitar el
reboot-por-saturación documentado). La corrida acotada terminó sola (exit 1 por el crash, no por
timeout ni OOM); el NAS no se degradó.
