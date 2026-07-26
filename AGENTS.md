# AGENTS.md — contrato de operación del programa Spec-Driven (chateam_jr)

> Creado 2026-07-23 en la Fase 0 de encuadre. **Motivo:** el método exige leer `AGENTS.md` antes de
> actuar y el archivo no existía (`ls AGENTS.md` → sin resultados). Este documento fija las reglas de
> juego; el *método* (fases, plantillas, gotchas) sigue viviendo en
> `docs/_consolidado/plan/GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md`.

## 1. Sistema existente, no greenfield

chateam_jr está **en producción** (`padeldev.codigo.plus`, PM2 `chateam-node` + `chateam-worker`).
No se reconstruye lo que funciona. Toda intervención es incremental y reversible por defecto.

## 2. Reglas de operación

1. Leer `AGENTS.md`, spec, plan y artefactos de la fase anterior **antes** de actuar.
2. No avanzar de fase si su gate no está completo.
3. Toda afirmación técnica lleva evidencia (ruta`:`línea, salida de comando, fila de BD).
4. Clasificar la realidad como **EXISTE · PARCIAL · AUSENTE · MOCK · NO VERIFICABLE**.
5. Prioridad: seguridad → datos → auth → continuidad → funcionalidad → contratos → rendimiento → UI.
6. Ninguna tarea se implementa sin spec y acceptance.
7. Un archivo lo edita **un solo agente a la vez** (el orquestador asigna y registra la propiedad).
8. Los subagentes **no** ejecutan builds, migraciones ni despliegues salvo autorización explícita.
9. Los cambios sensibles requieren backup, compatibilidad, script inverso, idempotencia y
   verificación aguas abajo.
10. Cada ola termina con gate, evidencia y bloque de progreso.

## 3. Clasificación de realidad

| Clase | Significado | Prueba mínima exigida |
| --- | --- | --- |
| **EXISTE** | Implementado y verificado en ejecución | Respuesta real del runtime / fila en BD / log |
| **PARCIAL** | Implementado a medias o solo en un camino | Evidencia del tramo que sí y del que no |
| **AUSENTE** | No hay código | Búsqueda negativa citada (`grep`/`find` + resultado) |
| **MOCK** | Hay código pero devuelve datos fabricados | La línea exacta que fabrica el dato |
| **NO VERIFICABLE** | No se puede probar con el acceso disponible | Qué faltó (credencial, entorno, permiso) |

Prohibido inferir estado a partir de un nombre de archivo, un comentario o un documento previo:
un comentario puede mentir (ver `reference_chateam_comment_promises_lie`).

## 4. Límites de los subagentes

Permitido sin autorización: leer, buscar, contar, consultar la BD en **solo lectura**, escribir sus
propios artefactos de auditoría bajo `audit/`.

**Requiere autorización explícita del usuario, caso por caso:**

- builds (`npm run build`, `vite build`), `npm install`
- `tsc --noEmit`, suites de test, Playwright, `scripts/ci-gate.sh`
- migraciones (`db:migrate`), seeds, cualquier `INSERT/UPDATE/DELETE/DDL`
- `pm2 restart|reload|stop`, despliegues, swap de `frontend/dist`
- escribir en `.env` (**read-only para agentes**), tocar `public/` (17 GB de adjuntos reales)
- `git push`

Motivo operativo del gate de builds: el NAS tiene 4 núcleos; los procesos pesados mueren con
SIGTERM 143 y degradan los servicios vivos. Si se autoriza, van por `systemd-run` con límite de
memoria.

## 5. Propiedad de archivos

El orquestador mantiene la tabla de propiedad en el bloque de progreso de cada ola: `archivo →
agente → ola`. Un agente que necesite un archivo ajeno lo pide; no lo edita.

## 6. Artefactos y convenciones

| Fase | Artefacto | Ubicación |
| --- | --- | --- |
| Encuadre | Estado del programa | `audit/00_ESTADO_PROGRAMA.md` |
| Descubrimiento | Inventario + partes por dominio | `audit/01_INVENTARIO_REPOSITORIO.md`, `audit/parts/*.md` |
| Spec | Spec global, por módulo y acceptance | `docs/_consolidado/spec/` |
| Plan | Olas priorizadas por riesgo | `docs/_consolidado/plan/` |
| Validación | Gate ejecutable | `scripts/ci-gate.sh` |

Datos crudos de auditoría (TSV/JSON) en `audit/_data/` para que toda cifra sea reproducible.

## 7. Gate

`scripts/ci-gate.sh` (4 pasos: RBAC smoke · E2E Playwright live · `npm audit` sin críticas nuevas ·
URL de API horneada en el build). **Es de ejecución autorizada**, no automática: levanta Playwright
contra el entorno vivo.

Un gate no es "no rompí nada": es la prueba de que el acceptance de la ola se cumple.
