# Tecnologías & Dependencias — Inventario & Auditoría (Spec-Driven)

> Proyecto: `chateam-platform` v1.1.0 (backend) + `jrchateam-frontend` v6.0.0
> Fecha: 2026-07-12 · Método: solo lectura (grep/read/node -e sobre package*.json)
> Runtime real observado: PM2 `chateam-node` online, `chateam-worker` **stopped** (4 restarts)

## 1. Propósito / Alcance
Inventario EXHAUSTIVO del stack tecnológico y del árbol de dependencias del monorepo `chateam_jr` (backend Node.js+TS ESM + frontend React/Vite), con foco en: dependencias deprecadas/vulnerables, versiones inconsistentes entre lo declarado y lo instalado, y discrepancias runtime vs configuración (Node, Docker, Postgres). No se modifica código.

## 2. Inventario (el "qué")

### 2.1 Conteo total de dependencias
| Paquete | prod | dev | Total declarado | Notas |
|---|---|---|---|---|
| Backend (`/package.json`) | **91** | **30** | **121** | +1 **instalada pero NO declarada**: `whatsapp-rust-bridge@0.5.4` → 92 prod efectivas en runtime |
| Frontend (`/frontend/package.json`) | **28** | **4** | **32** | `vite` y `@vitejs/plugin-react` mal ubicadas en `dependencies` (deberían ser dev); `eslint` ausente pese a script `lint` |

### 2.2 Runtime real (observado)
| Componente | Versión declarada/config | Versión REAL en ejecución | Estado |
|---|---|---|---|
| Node (PM2, nvm) | `NODE22=/home/jcromero09/.nvm/.../v22.22.0/bin/node` (hardcode en `ecosystem.chateam.local.cjs`) | **v22.22.0** | OK |
| Node (host default `/usr/bin/node`) | `engines.node >=20.0.0` | **v18.20.4** | INCUMPLE engines (ver H-04) |
| Dockerfile / Dockerfile.worker | `node:20-alpine` | (no en uso; corre por PM2/nvm) | Inconsistente con runtime v22 |
| PostgreSQL | compose: `postgres:15-alpine`; ecosystem `DB_PORT=5434` | **`pgvector/pgvector:pg17`** (`chateam-postgres`, 127.0.0.1:5434) | Compose STALE (pg15 sin pgvector) |
| Redis | compose: `redis:7-alpine` puerto 6379 | **`redis:7-alpine`** (`chateam-redis`, 127.0.0.1:6390) | Imagen OK, puerto difiere (6390 vs 6379) |
| PM2 apps activas | `chateam-node` (:3010), `chateam-worker` | node online, **worker STOPPED** | Worker caído |
| Ejecutor TS | `tsx@4.21.0` vía `--import tsx/esm` (ESM) | idem | OK |

### 2.3 Dependencias backend por función (versión declarada → instalada)
- **WhatsApp / Baileys**: `baileys@7.0.0-rc13` (RC, no estable), `@adiwajshing/keyed-db@^0.2.4` (archivado), `whatsapp-rust-bridge@0.5.4` (**undeclared**, usado en 8+ archivos: queues.ts, wbotMessageListener.ts, metaMessageListener.ts, facebookMessageListener.ts, ToolRegistry.ts, BookingService.ts, VerifyContactsWhatsapp.ts, ExportContactsToExcel.ts), `qrcode@1.5.4`, `qrcode-terminal@0.12.0`, `libsodium-wrappers@0.8.4`, `link-preview-js@3.1.0`.
- **IA**: `@anthropic-ai/sdk@^0.82.0`, `openai@^4.56.0→4.104.0`, `@fal-ai/client@1.10.1`, `@modelcontextprotocol/sdk@1.29.0`, `chromadb@3.2.1`, `microsoft-cognitiveservices-speech-sdk@1.46.0`, `@google-cloud/dialogflow@7.2.0` **y** `dialogflow@4.0.3` (DUPLICADO deprecado).
- **Pagos**: `stripe@^14.14.0→14.25.0`, `@paypal/checkout-server-sdk@1.0.3` (deprecado/sin mantenimiento), `gn-api-sdk-typescript@2.0.1` (Gerencianet/EfiBank).
- **Cloud / Storage**: `aws-sdk@2.1693.0` (v2 EOL) **y** `@aws-sdk/client-s3@3.1007.0` + `@aws-sdk/s3-request-presigner@3.1007.0` (v3) → SDK duplicado v2+v3. `@supabase/supabase-js@2.90.1`, `googleapis@170.0.0`.
- **Media**: `sharp@0.34.5`, `jimp@1.6.1`, `fluent-ffmpeg@2.1.3` + `@ffmpeg-installer/ffmpeg@1.1.0` + `@types/fluent-ffmpeg@2.1.27`, `archiver@7.0.1`, `mammoth@1.12.0`, `pdf-parse@1.1.1` (sin mantenimiento desde 2018), `xlsx@0.18.5` (SheetJS npm, vulnerable — ver H-01).
- **Colas / Redis / Realtime**: `bull@4.16.5`, `redis@4.7.1`, `rate-limit-redis@4.2.2`, `socket.io@4.x` + `@socket.io/redis-adapter@8.3.0` + `@socket.io/admin-ui@0.5.1`, `socket.io-client@4.8.1`, `bottleneck@2.19.5`, `async-mutex@0.5.0`.
- **ORM / DB**: `sequelize@6.37.7`, `sequelize-typescript@2.1.6`, `pg@8.18.0`, `mysql2@3.15.2`, `reflect-metadata@0.2.1`.
- **HTTP / Web**: `express@4.22.1` (v4), `body-parser@2.2.2` (v2 = para Express 5, mismatch con Express 4), `axios@1.7.4`+`axios-retry@4.5.0`, `helmet@7.1.0`, `cors@2.8.5`, `compression@1.7.4`, `cookie-parser@1.4.6`, `express-rate-limit@7.1.5`, `express-async-errors@3.1.1`, `http-graceful-shutdown@3.1.14`, `request@2.88.2` (**DEPRECADO**), `form-data@4.0.4`.
- **Utilidades fecha (3 librerías redundantes)**: `moment@2.30.1` (legacy), `dayjs@1.11.19`, `date-fns@4.1.0`.
- **Otros**: `lodash@4.17.21`, `bluebird@3.7.2` (legacy), `crypto-js@4.2.0`, `jsonwebtoken@9.0.2`, `bcryptjs@2.4.3`, `uuid@9.0.1`, `zod@3.25.76`, `yup@1.3.3`, `nodemailer@7.0.9`, `winston@3.19.0`+`winston-daily-rotate-file@5.0.0`, `pino@10.3.1`+`pino-pretty@13.1.1` (DOS loggers), `prom-client@15.1.3`, `@sentry/node@10.19.0`, `node-cron@4.2.1`, `node-cache@5.1.2`, `google-libphonenumber@3.2.43` + `libphonenumber-js@1.12.23` (DUPLICADO), `i18next@25.7.4`.

### 2.4 Frontend (React/Vite)
- **UI**: `@mui/material@7.3.7` + `@mui/icons-material@7.3.7` (**v7**) conviviendo con `@mui/joy@5.0.0-beta.52` que arrastra `@mui/system@5.18.0` (**v5**) → dos copias de `@mui/system` (ver H-02). `@emotion/react@11.14`, `@emotion/styled@11.14`.
- **React**: `react@18.3.1`, `react-dom@18.3.1`, `react-router-dom@7.9.4`.
- **Estado/UX**: `formik@2.4.9`, `yup@1.7.1`, `@hello-pangea/dnd@18.0.1`, `reactflow@11.11.4`, `emoji-picker-react@4.16.1`, `react-toastify@11`, `sonner@2.0.7`, `lucide-react@0.575.0`.
- **Charts**: `chart.js@4.5.1` + `react-chartjs-2@5.3.1` **y** `recharts@3.2.1` (dos libs de gráficos).
- **Media/HTTP**: `compressorjs@1.2.1`, `axios@1.12.2`, `socket.io-client@4.8.1`, `qrcode@1.5.4`.
- **Pagos**: `@paypal/react-paypal-js@8.9.2`.
- **Build**: `vite@7.3.1`, `@vitejs/plugin-react@5.0.4`, `typescript@5.9.3`, `@types/node@20.x` (dev).

### 2.5 Toolchain / Config (archivos)
- **TS**: `tsconfig.json` (ES2022/ESM, `strict:false`, excluye frontend/tests), `tsconfig.backend.json` (ES2021 ESM), `tsconfig.dev.json` (CommonJS + ts-node) → 3 configs, targets/modules divergentes. Frontend: `tsconfig.json` (`strict:true`, bundler).
- **ESLint**: backend `.eslintrc.cjs` (legacy `eslint@8.57.1` EOL, `@typescript-eslint@6.14`). Frontend usa `eslint .` en script pero **no lo declara**.
- **Tests**: `jest.config.ts` (ts-jest, isolatedModules), `playwright.config.ts` (baseURL `localhost:3000`, 5 devices), `@playwright/test@1.40.1`.
- **Docker**: `Dockerfile`, `Dockerfile.worker` (ambos `node:20-alpine`, CMD `node dist/server.js`). Compose: `docker-compose.yml`, `.override.yml`, `.production.yml`, `.staging.yml`, `.replicas.yml`, `.test.yml`, `.listmonk.yml` (7 archivos).
- **PM2**: `ecosystem.config.cjs` (cwd `/home/deploy/...`, 4 apps: node-1/node-2/worker/frontend, `tsx/esm`), `ecosystem.chateam.local.cjs` (Node22 hardcode, 2 apps, worker con `--require tsx/cjs`), `chateam.config.cjs` (idéntico a local salvo el worker SIN `--require tsx/cjs`). **3 ecosystems divergentes**; el activo es `ecosystem.chateam.local.cjs`.

## 3. Arquitectura & Flujos (el "cómo")
- Ejecución TS directa (sin build) vía `tsx/esm` bajo Node 22 lanzado por PM2 (`ecosystem.chateam.local.cjs`). El `npm run build` (`tsc` + `tsc-esm-fix`) y los `Dockerfile` (que compilan a `dist/` y corren `node dist/server.js`) **no reflejan el runtime real**.
- Backend en `:3010`, expuesto tras nginx en `padeldev.codigo.plus/be`. Postgres pgvector:pg17 (:5434) + Redis 7 (:6390). El `docker-compose.yml` del repo NO gobierna estos contenedores (imágenes/puertos difieren); los contenedores corren fuera de ese compose.
- `package-lock.json` incluye `whatsapp-rust-bridge@0.5.4` como dependencia raíz pero `package.json` NO la declara → **lock y manifest desincronizados** (existe `package.json.bak` como evidencia de sobrescritura).

## 4. Hallazgos (SEVERIDAD P0/P1/P2/P3)

### P0
- **H-00 (P0) — Manifest desincronizado / dependencia fantasma.** `whatsapp-rust-bridge@0.5.4` está instalada y usada en ≥8 archivos de negocio (WA/Meta/Facebook listeners, ToolRegistry, colas) pero **NO figura en `package.json`** (sí en `package-lock.json`). Un `npm ci` fallaría por lock desincronizado, y un `rm -rf node_modules && npm install` **eliminaría la librería**, rompiendo el envío/recepción de WhatsApp. Existe `package.json.bak` que evidencia una sobrescritura del manifest. Fix: re-declarar `whatsapp-rust-bridge@0.5.4` en `dependencies` y regenerar lock.
- **H-01 (P0) — `xlsx@0.18.5` (SheetJS) vulnerable.** La build de npm (`0.18.5`, congelada) tiene Prototype Pollution (CVE-2023-30533) y ReDoS (CVE-2024-22363), sin fix publicado en el registro npm. Usado para import/export de contactos. Fix: migrar al tarball oficial de SheetJS `cdn.sheetjs.com` (`0.20.3+`) o reemplazar por `exceljs`.

### P1
- **H-02 (P1) — MUI v5 vs v7 mezclados (doble `@mui/system`).** `@mui/material@7.3.7`/`@mui/icons-material@7.3.7` (v7) conviven con `@mui/joy@5.0.0-beta.52` que instala `@mui/system@5.18.0`; coexisten dos versiones de `@mui/system` (v5 + v7) → conflictos de theming/emotion, comportamiento impredecible y bloat de bundle. Joy no tiene release estable ni versión v7. Fix: eliminar `@mui/joy` (migrar componentes a Material v7) o congelar todo el ecosistema en v5.
- **H-03 (P1) — `request@2.88.2` deprecado (dependencia DIRECTA).** Declarado en `package.json` (línea 124). Sin mantenimiento desde 2020, arrastra `har-validator@5.1.5` (deprecado) y `tough-cookie` viejos (riesgo SSRF/prototype pollution en la cadena). Fix: reemplazar usos por `axios` (ya presente) y eliminar `request` + `@types/request`.
- **H-05 (P1) — `dialogflow@4.0.3` deprecado y DUPLICADO.** Coexiste con `@google-cloud/dialogflow@7.2.0` (el reemplazo oficial). `dialogflow@4` está EOL. Fix: eliminar `dialogflow@4.0.3`, unificar en `@google-cloud/dialogflow`.
- **H-06 (P1) — `multer@1.4.5-lts.2` (línea 1.x deprecada).** Multer 1.x está deprecado; 2.x corrige DoS por manejo de multipart. Endpoints de subida (media WA) expuestos. Fix: migrar a `multer@^2`.

### P2
- **H-04 (P2) — Incoherencia de versión de Node.** `engines.node >=20`, runtime real Node **22.22.0** (nvm, correcto), pero `Dockerfile`/`Dockerfile.worker` fijan `node:20-alpine` y el `/usr/bin/node` del host es **18.20.4** (incumple engines; cualquier script/cron que use el node del PATH corre en 18). Sin `.nvmrc`. Fix: añadir `.nvmrc` (22), alinear Dockerfiles a `node:22-alpine`, subir `engines` a `>=22`.
- **H-07 (P2) — `aws-sdk` v2 (2.1693.0) en fin de soporte + duplicado con v3.** AWS SDK JS v2 entró en mantenimiento/EOL; además coexiste con `@aws-sdk/client-s3` v3. Doble peso de bundle/instalación. Fix: eliminar `aws-sdk` v2 y migrar sus usos a los clientes v3 ya presentes.
- **H-08 (P2) — `eslint@8.57.1` EOL.** ESLint 8 dejó de recibir soporte (fin de vida 2024-10). Config `.eslintrc.cjs` legacy. Fix: migrar a ESLint 9 + flat config y `@typescript-eslint@8`.
- **H-09 (P2) — Docker Compose STALE vs runtime.** `docker-compose*.yml` declaran `postgres:15-alpine` (sin pgvector) mientras el contenedor real es `pgvector/pgvector:pg17`; puerto Redis 6379 en compose vs 6390 real. El compose no gobierna la infra viva → falso sentido de reproducibilidad. Fix: actualizar compose a `pgvector/pgvector:pg17` y puertos reales, o marcar los compose como no usados.
- **H-10 (P2) — 3 ecosystems PM2 divergentes.** `ecosystem.config.cjs` (cwd inexistente `/home/deploy/...`), `chateam.config.cjs` y `ecosystem.chateam.local.cjs` difieren en apps, memoria y flags del worker (`--require tsx/cjs` presente solo en `.local`). Riesgo de arrancar el config equivocado (worker ya STOPPED). Fix: dejar un único ecosystem canónico.

### P3
- **H-11 (P3) — Dependencias duplicadas/legacy redundantes.** Fecha: `moment`+`dayjs`+`date-fns` (3 libs); teléfono: `google-libphonenumber`+`libphonenumber-js`; logs: `winston`+`pino`; charts frontend: `chart.js/react-chartjs-2`+`recharts`; `bluebird` (promesas nativas ya cubren). Consolidar reduce bundle y superficie de CVE.
- **H-12 (P3) — Transitivos deprecados.** `glob@7.x` (<9, deprecado), `har-validator@5.1.5`, cadena de `request`. Se resuelven al eliminar `request` y actualizar herramientas.
- **H-13 (P3) — Deps sin mantenimiento.** `pdf-parse@1.1.1` (2018), `@paypal/checkout-server-sdk@1.0.3` (repo archivado por PayPal), `@adiwajshing/keyed-db` (renombrado). Planificar reemplazos.
- **H-14 (P3) — `body-parser@2.2.2` (v2, para Express 5) con `express@4.22.1`.** Mismatch de major; Express 4 ya incluye su propio body-parser. Evitar el paquete externo o subir a Express 5.
- **H-15 (P3) — Frontend: `vite`/`@vitejs/plugin-react` en `dependencies` y `eslint` ausente.** Herramientas de build clasificadas como runtime; script `lint` referencia un `eslint` no declarado. Sin `engines` en frontend.
- **H-16 (P3) — `baileys@7.0.0-rc13` (release candidate).** Dependencia core de WhatsApp fijada en una RC, no estable. Vigilar y fijar a estable al liberarse.

## 5. Recomendaciones
1. **Inmediato (P0):** re-declarar `whatsapp-rust-bridge@0.5.4` en `package.json`, regenerar `package-lock.json`, borrar `package.json.bak`; parchear `xlsx` al tarball oficial `0.20.3+`. Nunca correr `npm install` limpio hasta corregir el manifest (perdería la librería del bridge).
2. **Corto plazo (P1):** desmontar `@mui/joy` o congelar MUI en un único major; eliminar `request`, `dialogflow@4`, `aws-sdk` v2; subir `multer` a v2.
3. **Medio plazo (P2):** `.nvmrc`=22 + Dockerfiles a `node:22-alpine` + `engines>=22`; ESLint 9 flat config; alinear compose a pg17/pgvector; unificar en un solo ecosystem PM2.
4. **Higiene (P3):** consolidar libs duplicadas de fecha/teléfono/log/charts; retirar legacy (`bluebird`, `moment`, `body-parser` externo); reclasificar tooling frontend; establecer `npm audit` en CI.

## 6. Evidencia (archivo:línea, comandos, salidas)
- Conteos: `node -e Object.keys(...)` → backend `prod=91 dev=30`; frontend `prod=28 dev=4`.
- Manifest vs lock: `grep whatsapp-rust-bridge package.json` → "NOT in package.json deps"; `package-lock.json:"whatsapp-rust-bridge": "0.5.4"`; `require(whatsapp-rust-bridge/package.json).version` → `0.5.4`. Usos: `grep -rl whatsapp-rust-bridge` → queues.ts, services/WbotServices/wbotMessageListener.ts, services/MetaServices/metaMessageListener.ts, services/FacebookServices/facebookMessageListener.ts, services/AIAgentServices/ToolRegistry.ts, services/AppointmentServices/BookingService.ts, jobs/VerifyContactsWhatsapp.ts, jobs/ExportContactsToExcel.ts.
- Instaladas: `openai=4.104.0`, `stripe=14.25.0`, `sharp=0.34.5`, `bull=4.16.5`, `sequelize=6.37.7`, `pg=8.18.0`, `express=4.22.1`, `body-parser=2.2.2`, `multer=1.4.5-lts.2`, `xlsx=0.18.5`, `request=2.88.2`, `eslint=8.57.1`, `tsx=4.21.0`, `aws-sdk=2.1693.0` + `@aws-sdk/client-s3=3.1007.0`.
- Frontend MUI: `@mui/material=7.3.7`, `@mui/icons-material=7.3.7`, `@mui/joy=5.0.0-beta.52`, `@mui/system=5.18.0`, `vite=7.3.1`.
- Runtime: `node -v` (host) → `v18.20.4`; nvm v22 → `v22.22.0`; `pm2` → `chateam-node online`, `chateam-worker stopped(4)`; `docker ps` → `chateam-postgres | pgvector/pgvector:pg17 | 127.0.0.1:5434->5432`, `chateam-redis | redis:7-alpine | 127.0.0.1:6390->6379`.
- Compose stale: `docker-compose.yml:58 image: postgres:15-alpine`; `.production.yml:105 postgres:15-alpine`, `:147 redis:7-alpine`; `.override.yml:23 postgres puerto 5432`.
- Configs: `Dockerfile:5,49 FROM node:20-alpine`; `package.json:187 engines.node ">=20.0.0"`; `ecosystem.chateam.local.cjs:4 NODE22=.../v22.22.0`; `tsconfig.json` (ES2022 strict:false) vs `tsconfig.dev.json` (commonjs) vs `tsconfig.backend.json` (ES2021).
- Transitivos: `har-validator-5.1.5` (package-lock.json:11537); `glob 7.x/10.x` múltiples (package-lock.json).
