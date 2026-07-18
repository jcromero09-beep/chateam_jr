# chateam-platform (chateam_jr)

Plataforma de comunicacion omnicanal / atencion al cliente con IA (RAG) sobre WhatsApp Cloud API. Multi-tenant, self-hosted. Backend Node.js + TypeScript (ESM), frontend React + Vite, PostgreSQL, colas/workers, Docker + PM2 + Prometheus.

## Requisitos
- Node.js (LTS) y npm
- PostgreSQL
- (Opcional) Docker + docker-compose, PM2

## Instalacion
```bash
npm ci
cp .env.example .env    # completar valores reales (NO commitear .env)
npm run db:create       # crear base de datos
npm run db:migrate      # aplicar migraciones
npm run db:seed         # datos iniciales (opcional)
```

## Variables de entorno
Ver `.env.example` (133 variables). Copiar a `.env` y completar. `.env` NO se versiona.

## Desarrollo
```bash
npm run dev             # backend (tsx watch server-simple.ts)
npm run dev:worker      # worker (tsx watch worker.ts)
```

## Build y produccion
```bash
npm run build           # compila a dist/
npm start               # ejecuta el servidor
npm run start:pm2       # produccion con PM2 (ecosystem.config.cjs)
```

## Verificacion / Tests
```bash
npm run type-check      # tsc --noEmit
npm run lint            # eslint
npm run format:check    # prettier --check
npm run test:unit       # jest (unit)
npm run test:integration
npm run test:e2e        # playwright
```
Detalles y requisitos (DB de test) en `spec/testing-spec.md`.

## Estructura
```
routes/        rutas HTTP (montadas via routes/index.ts)
controllers/   reciben y responden
services/      logica de negocio
models/        acceso a datos (Sequelize)
middleware/    middlewares
workers/       procesamiento asincrono
frontend/      app React + Vite
spec/          especificaciones (fuente de verdad del "que")
plan/          plan de implementacion (el "como")
```

## Fuente de verdad
- `spec/SPEC.md` — que hace el sistema
- `spec/testing-spec.md` — como correr los tests
- `plan/PLAN.md` — plan de remediacion y proximos pasos
- `AGENTS.md` — instrucciones para asistentes de IA

Si el codigo difiere de la spec, se corrige el codigo.
