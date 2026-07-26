# W0-INV-07 — Dependencias circulares (madge)

> Ola 0 (INV) · 2026-07-24 · `npx madge --circular --extensions ts --ts-config tsconfig.json
> app.ts server-distributed.ts worker.ts` (read-only, tool transitorio, no modifica repo). 1342
> archivos procesados en 19,4s. Load NAS ~2,7.

## Resultado: **162 ciclos** (la SPEC estimaba 154, NO VERIFICABLE → ahora medido)

| Categoría | Ciclos | Naturaleza |
|---|---|---|
| Solo `models/` | **114** | **Benignos** — patrón normal de `sequelize-typescript` (FKs bidireccionales) |
| Involucran `services/`/`controllers/` | **48** | **Deuda de lógica real** — dificultan testear módulos aislados |
| De esos, pasan por `wbotMessageListener.ts` | **42** | Concentrados en el god-object (hub) |

Muestra de ciclos de lógica: `queues.ts > jobs/SendPendingMessage.ts > SendPendingMessagesService >
SendWhatsAppMessage > … `; `libs/wbot.ts > StartWhatsAppSession > wbotMessageListener`.

## Clasificación / impacto en el plan
- **W8-DEBT-04 (ciclos):** de NO VERIFICABLE a **medido: 48 ciclos de lógica** a romper (los 114 de
  models se dejan; son el patrón esperado del ORM).
- **W8-DEBT-03 (split god-object):** confirmado como palanca principal — **42/48** ciclos de lógica
  atraviesan `wbotMessageListener.ts`; extraerlo por fases elimina la mayoría de la deuda de ciclos.
- Confianza ALTA (herramienta estándar, grafo real desde los entrypoints).

## Límite
madge partió de `app.ts`/`server-distributed.ts`/`worker.ts` (grafo real de ejecución). Módulos no
alcanzables desde esos entrypoints (código muerto) no entran — coherente, porque los ciclos que
importan son los del código vivo.
