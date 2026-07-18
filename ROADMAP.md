# ROADMAP — chateam_jr

> **Fuente de verdad del estado y plan.** Los `docs/_consolidado/plan/PLAN*.md` y los
> `docs/_consolidado/raiz/*CAMPAIGNS*` son **HISTÓRICOS** (sus checkboxes NO reflejan la
> realidad — ver sus banners). El plan vigente por olas es
> **`docs/PLAN_INTEGRAL_OLAS_2026_07.md`**.

## Estado (2026-07-17) — evaluado 68→~75/100, en subida

Sistema **funcional en producción** (CRM omnicanal WhatsApp multi-tenant). Las auditorías de
esta sesión cerraron lo crítico; el resto es deuda gestionada por olas.

### Olas cerradas esta sesión
- **Backend (auditoría):** IDOR cross-tenant cerrados + verificados, crashes `forEach(async)` → for-of, secretos redactados en logs, tipado frontera auth/tenant.
- **Frontend (auditoría, Olas 0-5):** XSS plantillas (iframe sandbox + DOMPurify), falso-éxito, N+1 tickets, RBAC tipado, poda console. Desplegado + verificado en navegador.
- **Ola 1 — runner de migraciones:** `SequelizeMeta` reconciliado (baseline 388) → `db:migrate` ya es seguro (era una mina que rompía features en silencio).
- **Ola 2 — seguridad:** rate limiter cableado a login/signup (brute-force → 429).
- **Ola 3 — código muerto:** 6 archivos huérfanos a cuarentena (backend).
- **Ola 4 — regresión:** `scripts/regression-sondas.sh` (guarda los fixes; 12/12).
- **Ola 5 (parcial):** UpdateCompanyService dejaba de guardar emailCredits; ImportContactsService `forEach(async)` → for-of.
- **Super-admin:** `/recepts` 500→200 (migración receipts), `POST /companies` con isSuper.
- **Storage:** dedup 17G→4.7G + cron nocturno; arquitectura híbrida decidida (S3-compat + Drive por empresa).

### Pendiente (ver `docs/PLAN_INTEGRAL_OLAS_2026_07.md`)
- **Ola 5 (mayor, dedicado):** romper el monolito `wbotMessageListener.ts` (~7.500 líneas) — hot-path de ingesta WhatsApp, NO refactor casual. **HARNESS VIVO** (2026-07-17, Path B): el monolito **ya se importa en jest en verde** (`tests/harness/monolith.loads.test.ts`) vía AST transform (`esmCompatAst.cjs`) + `moduleNameMapper` (baileys stub + `.js`) + mocks de infra, en `jest.harness.config.cjs`, **0 cambios en producción**. Falta el split en sí (Tier 0: characterization tests de parsers → extraer → verificar). Receta completa en `docs/REFACTOR_MONOLITO_WBOT.md`.
- **Ola 6:** crear `docs/INFRASTRUCTURE.md` y `docs/MULTI-TENANT.md` (los lee `pre-deploy-validation.ts`).
- **Ola 7 (producto):** dashboard de plataforma, cuotas/feature-flags por empresa, visor de auditoría de impersonación, Fase A storage (cablear media a S3).
- **Config JC (.env/sudo):** headers de seguridad nginx, rotar secretos, `SENTRY_DSN`, R2/B2 + env `S3_*`.
- **Tests:** triar 23 tests unit que fallan (lógica/aserción).

## Infra (referencia rápida)
- Entrypoint prod: `server-distributed.ts` (PM2 `chateam-node`, backend **:3010**). Worker: `chateam-worker`.
- nginx: `padeldev.codigo.plus`, SPA en `frontend/dist`, backend vía prefijo **`/be/`**, socket.io en `/socket.io/`.
- Migraciones: `npm run db:migrate` (YA seguro tras Ola 1). NO usar contra prod sin backup.
- BD: PostgreSQL 17 en `docker exec chateam-postgres` (db `chateamjr`). Redis + Bull.
