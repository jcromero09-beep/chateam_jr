# Testing Spec — chateam_jr

> Como correr TODA la suite de pruebas. Alineado con guia v7.0 seccion 15.
> Referencia CI: .github/workflows/ci.yml

## Herramientas
- Unit / Integration: Jest (ts-jest / tsx)
- E2E: Playwright (playwright.config.ts)
- 77 archivos de test en el repo.

## Scripts (package.json)
- npm run type-check   -> tsc -p tsconfig.json --noEmit   (verificacion de tipos)
- npm run lint         -> eslint (config .eslintrc.cjs)
- npm run format:check -> prettier --check
- npm run test         -> jest (toda la suite)
- npm run test:unit    -> jest (unit)
- npm run test:integration -> jest --config jest.integration.config.js
- npm run test:coverage -> jest --coverage
- npm run test:e2e     -> playwright test

> NOTA: type-check, test:unit y format:check fueron agregados en esta auditoria
> porque el CI los invocaba pero no existian. .eslintrc.js se renombro a .eslintrc.cjs
> (fallaba con ERR_REQUIRE_ESM por "type":"module").

## Requisitos para correr la suite completa
1. Dependencias: npm ci
2. Base de datos de test PostgreSQL:
   - NODE_ENV=test
   - DB_NAME=chateam_test  (crear la DB antes)
   - Correr migraciones: npm run db:migrate
3. Variables de entorno de test (basadas en .env.example una vez generado).

## Secuencia recomendada (equivalente al pipeline CI)
    npm ci
    npm run type-check
    npm run lint
    npm run format:check
    NODE_ENV=test DB_NAME=chateam_test npm run db:migrate
    NODE_ENV=test DB_NAME=chateam_test npm run test:unit
    NODE_ENV=test DB_NAME=chateam_test npm run test:integration
    npm run test:e2e

## Criterio de exito
- type-check: 0 errores
- test:unit y test:integration: 100% en verde
- Sin secretos ni datos reales en fixtures de test
