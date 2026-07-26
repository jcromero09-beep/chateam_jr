# 01 — Inventario del repositorio

> Fase 1 (Descubrimiento). Datos obtenidos por inspección directa del repositorio, del proceso PM2 en
> ejecución y de la base de datos real (solo consultas de lectura), 2026-07-22.

## 1.1 Identificación

| Campo | Valor | Evidencia |
| --- | --- | --- |
| Nombre | `chateam-platform` v1.1.0 | `package.json:2-3` |
| Frontend | `jrchateam-frontend` v6.0.0 | `frontend/package.json:2-3` |
| Descripción | Plataforma omnicanal de gestión de comunicaciones empresariales | `package.json:5` |
| Raíz | `/home/jcromero09/chateam_jr` | — |
| Rama git | `checkpoint/wip-3meses-2026-07-18` | `git status -sb` |
| Último commit | `8819ad7` — 2026-07-19 12:21 | `git log -1` |
| Módulos ES | `"type": "module"` (ESM, ejecutado con `tsx`) | `package.json:4` |

## 1.2 Proyectos detectados

| Proyecto | Ruta | Tecnología | Propósito | Estado aparente |
| --- | --- | --- | --- | --- |
| Backend API | raíz (`app.ts`, `routes/`, `controllers/`, `services/`, `models/`) | Node 22 + TS ESM, Express 4.19, sequelize-typescript 2.1 | API REST + WebSocket omnicanal | **Activo** — PM2 `chateam-node` en `:3010` |
| Worker | `worker.ts`, `jobs/`, `workers/`, `backendQueues.ts` | BullMQ + Redis | Colas, campañas, envíos, jobs de IA | **Activo** — PM2 `chateam-worker`, 10 días |
| Frontend web | `frontend/` | React 18.3 + Vite 7.1 + TS 5.9, MUI 7 + Radix + Tailwind | SPA de operación y administración | **Activo** — build servido por nginx |
| Scheduler / cron | `backendCronJobs.ts` (42 KB), `scheduler/` | node-cron | Tareas programadas dentro del proceso API | **Activo** (avisos *missed execution* en log) |
| `audit-service/` | `audit-service/` | — | Servicio de auditoría separado | **Por verificar** — no montado en `routes/index.ts` |
| `backend/` | `backend/` | — | Carpeta homónima al backend raíz | **Sospecha de duplicado/legado** |
| `meta-marketing/` | `meta-marketing/` | — | Integración Meta Ads | **Por verificar** |
| `_cuarentena/` | `_cuarentena/` (173 MB) | — | Código retirado deliberadamente | **Inactivo por diseño** |
| App móvil Flutter | — | — | — | **NO EXISTE**: `find . -name pubspec.yaml` → 0 resultados |

> **Consecuencia de alcance:** el Agente 5 (Flutter) del encargo no tiene objeto de auditoría. Las celdas
> «Flutter» de las matrices se marcan **N/A**. Si existe una app móvil, vive fuera de este repositorio y no
> es verificable desde aquí.

## 1.3 Magnitudes verificadas

| Métrica | Valor | Cómo se obtuvo |
| --- | --- | --- |
| Endpoints HTTP | **891** | extractor sobre `routes/` → `audit/_data/endpoints.tsv` |
| — sin middleware de autenticación | **99** | misma fuente, columna `auth=NO` |
| Archivos de rutas | 135 | 128 montados en `routes/index.ts`, **7 sin montar** |
| Controladores | 151 archivos | `controllers/` |
| Servicios | 878 archivos en 158 carpetas | `services/` |
| Modelos Sequelize | **183** | `models/*.ts` → `audit/_data/models.tsv` |
| — sin `companyId` | 36 | misma fuente |
| — no registrados en `database/index.ts` | 6 | `audit/_data/models_no_registrados.txt` |
| Tablas reales en PostgreSQL | **199** | `information_schema.tables` (db `chateamjr`) |
| Archivos en `database/` | 402 (migraciones + seeds + SQL suelto) | `database/` |
| Páginas React | 172 `.tsx` | `frontend/src/pages` |
| Componentes React | 120 `.tsx` | `frontend/src/components` |
| Documentos markdown | 151 en `docs/` + `README.md`, `ROADMAP.md` | — |
| Archivos de test | 58 | `tests/` (unit, integration, e2e, performance, harness) |

Tablas con mayor volumen (`pg_stat_user_tables`): `LogTickets` 225 675 · `Messages` 79 195 ·
`InboundEventLedger` 77 494 · `Notifications` 30 637 · `Contacts` 11 385 · `Baileys` 8 762 · `Tickets` 7 451.

Ocupación en disco: `public/` 5,0 GB · `node_modules/` 1,1 GB · `_cuarentena/` 173 MB · `frontend/` 108 MB ·
`logs/` 7,4 MB.

## 1.4 Infraestructura en ejecución (estado real, no declarado)

| Componente | Realidad observada | Evidencia |
| --- | --- | --- |
| API | PM2 `chateam-node`, fork, Node **v22.22.0**, cwd del repo, `:3010`, **138 reinicios acumulados** | `pm2 describe`, `ss -tlnp` |
| Worker | PM2 `chateam-worker`, 10 días sin reiniciar | `pm2 list` |
| PostgreSQL | Contenedor `chateam-postgres` (`pgvector/pgvector:pg17`) en `127.0.0.1:5434` | `docker ps` |
| Redis | Contenedor `chateam-redis` (`redis:7-alpine`) en `127.0.0.1:6390` | `docker ps` |
| Variables de entorno | **No se leen del `.env`**: PM2 inyecta `DB_PORT=5434`, `REDIS_PORT=6390`. El `.env` del repo apunta a `localhost:5432`, que rechaza la conexión (`pg_hba`) | `/proc/<pid>/environ` vs `.env` |
| Node del shell | v18.20.4 (nvm por defecto) ≠ v22.22.0 (proceso PM2) | `node -v` |

> Divergencia relevante: existen 7 `docker-compose*.yml` (production, staging, replicas, test, override,
> listmonk, base) pero el sistema **no corre orquestado por ninguno**; solo hay dos contenedores de datos y
> dos procesos PM2. Detalle en `10_DEVOPS_INFRAESTRUCTURA.md`.

## 1.5 Comandos declarados

| Propósito | Comando | Fuente |
| --- | --- | --- |
| Desarrollo API | `npm run dev` (`tsx watch server-simple.ts`) | `package.json:7` |
| Desarrollo worker | `npm run dev:worker` | `package.json:9` |
| Build backend | `npm run build` (`tsc` + `tsc-esm-fix`) | `package.json:10` |
| Arranque producción | `npm run start:pm2` (`ecosystem.config.cjs`) | `package.json:13` |
| Migraciones | `npm run db:migrate` (`node dist/scripts/runMigrations.js`) | `package.json:15` |
| Tests unitarios | `npm test` / `jest` | `package.json:18` |
| Tests integración | `npm run test:integration` | `package.json:21` |
| E2E | `npm run test:e2e` (Playwright) | `package.json:22` |
| Type-check | `npm run type-check` (`tsc --noEmit`) | `package.json` |
| Lint | `npm run lint` (ESLint sobre 8 carpetas; **no cubre `jobs/`, `workers/`, `dto/`, `libs/`**) | `package.json:24` |
| Build frontend | `cd frontend && npm run build` | `frontend/package.json:7` |

> `db:migrate`/`db:seed` apuntan a `dist/`, es decir **exigen build previo**; el arranque usa `tsx` sobre las
> fuentes. Coexisten dos modos de ejecución (compilado y on-the-fly).

## 1.6 Comandos ejecutados durante la auditoría

| Comando | Propósito | Resultado | Errores | Evidencia |
| --- | --- | --- | --- | --- |
| `git status/log` | Estado del repo | Rama checkpoint, 1 098 borrados de `dist_bak*`, 9 dirs sin trackear | — | §1.1 |
| `pm2 list/describe/logs` | Estado de procesos | 2 procesos activos, 138 reinicios | Log con errores Meta API `(#200)` | §1.4 |
| `docker ps` | Contenedores | `chateam-postgres`, `chateam-redis` | — | §1.4 |
| `ss -tlnp` | Puertos | `:3010` API, `5434` PG, `6390` Redis | — | §1.4 |
| extractor de endpoints (Node) | Inventario de rutas | 891 endpoints, 7 rutas sin montar | — | `audit/_data/endpoints.tsv` |
| extractor de modelos (Node) | Inventario ORM | 183 modelos, 36 sin `companyId` | — | `audit/_data/models.tsv` |
| `psql information_schema` | Inventario de tablas | 199 tablas | Primer intento falló con `.env` (`pg_hba`); se usó el env real de PM2 | `audit/_data/db_tables.tsv` |
| `psql pg_stat_user_tables` | Volumetría | Top 25 tablas | — | `audit/_data/db_rowcounts.tsv` |

**No se ejecutaron** builds, `npm install`, suites de test ni `tsc --noEmit` durante la fase multiagente: el
host tiene 4 núcleos con *load average* 4,9 y ejecutarlos habría degradado los servicios en ejecución. Queda
documentado como limitación en `00_RESUMEN_EJECUTIVO.md`.
