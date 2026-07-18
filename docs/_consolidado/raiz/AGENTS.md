# AGENTS.md

> Instrucciones para asistentes de IA que trabajan en este proyecto.
> Siempre consultar `/spec/` y `/plan/` antes de implementar. Este archivo nunca contradice spec/plan.

## 1. Contexto del Proyecto
- **Nombre:** chateam-platform (chateam_jr)
- **Stack:** Node.js + TypeScript (ESM), Express, React+Vite, PostgreSQL (Sequelize), colas/workers, Docker+PM2+Prometheus
- **Arquitectura:** capas routes -> controllers -> services -> models; workers async; multi-tenant
- **Proposito:** Plataforma omnicanal de atencion al cliente con IA/RAG sobre WhatsApp Cloud API

## 2. Fuente de Verdad
- `spec/SPEC.md` -> que hace el sistema
- `spec/testing-spec.md` -> como correr los tests
- `plan/PLAN.md` -> plan de implementacion/remediacion
- Si el codigo difiere de la spec, corregir el codigo (no la spec).

## 3. Comandos de Verificacion
Ejecutar SIEMPRE antes de declarar una tarea completa:
```bash
npm run type-check      # tsc --noEmit
npm run lint            # eslint (.eslintrc.cjs)
npm run format:check    # prettier --check
npm run test:unit       # jest
npm run build           # compila a dist/
```
Suite completa y requisitos de DB de test: ver `spec/testing-spec.md`.

## 4. Convenciones de Codigo
- **Lenguaje:** TypeScript (ESM, "type":"module")
- **Estilo:** Prettier
- **Nomenclatura de archivos:** camelCase para rutas/servicios (seguir el patron existente)
- **Imports:** estandar -> terceros -> internos
- **Tipado:** objetivo strict (hoy en migracion; ver plan Fase 2)
- **Comentarios:** solo el por que, nunca el que

## 5. Lo que NO se debe hacer
- No modificar `/spec`, `/plan` sin pedido explicito
- No commitear `.env` ni secretos; usar `.env.example`
- No instalar dependencias nuevas sin justificar en `/spec`
- No hardcodear secretos ni valores que deban ser variables de entorno
- No romper los procesos PM2 en produccion (node-1, node-2, worker, frontend)
- No hacer `git push` sin confirmacion explicita del usuario
- No agregar `: any`; preferir tipos concretos
- No dejar `console.log` en frontend de produccion

## 6. Estructura del Proyecto
```
routes/ controllers/ services/ models/ middleware/ workers/
frontend/   -> app React+Vite
spec/ plan/ -> documentacion (fuente de verdad)
server-simple.ts -> entrypoint canonico
```

## 7. Deuda tecnica conocida (ver plan/PLAN.md)
- ESLint reporta ~1440 errores por resolver
- TypeScript aun no en modo strict
- 3 variantes de servidor por consolidar
- ~133 variables de entorno por documentar en tabla

## 8. Mantenimiento
Los asistentes pueden SUGERIR cambios a este archivo, pero no aplicarlos sin confirmacion.
Al actualizar, verificar que no contradiga `/spec` ni `/plan`.
