# Reparaciones Finales ChatEAM — Índice

Registro breve de reparaciones de deuda técnica del frontend. Un archivo por reparación (resúmenes cortos).

| Fecha | Reparación | Estado | Archivo |
|-------|-----------|--------|---------|
| 2026-07-06 | Alineación tipos React 18 / Node 20 | ✅ Hecho | `2026-07-06-tipos-react18-node20.md` |
| 2026-07-06 | Salida de MUI v4 — plan general | 🟡 En curso | `2026-07-06-plan-salida-mui-v4.md` |
| 2026-07-06 | Salida MUI v4 — **piloto Kanban.tsx** + quita `material-ui-color` | ✅ Hecho | `2026-07-06-piloto-mui-v4-kanban.md` |
| 2026-07-06 | Salida MUI v4 — **11 modales FlowBuilder por fases** + quita `@material-ui` del package.json | ✅ Hecho | `2026-07-06-migracion-flowbuilder-mui-v4.md` |
| 2026-07-06 | **Fix crash `Dialog reading 'duration'`** — coexistencia Joy+Material (THEME_ID) | ✅ Hecho | `2026-07-06-fix-crash-dialog-joy-material.md` |
| 2026-07-06 | Mejora — **menú lateral con enlaces reales** (click derecho → abrir en pestaña nueva) | ✅ Hecho | `2026-07-06-sidebar-enlaces-pestana-nueva.md` |
| 2026-07-06 | Mejora — **filtro de tickets con selector de rango de fechas** (reutiliza DateRangePicker) | ✅ Hecho | `2026-07-06-filtro-rango-fechas-tickets.md` |
| 2026-07-06 | Mejora — **espaciado tarjeta ticket + badge de no leídos más visible** | ✅ Hecho | `2026-07-06-espaciado-badge-tickets.md` |
| 2026-07-07 | **Fix `require()` sessionRegistry en ESM** — node-1 no ejecutaba el registro de respaldo de sesión en Redis (`Cannot find module`) | ✅ Hecho | `2026-07-07-fix-sessionregistry-require-esm.md` |
| 2026-07-07 | **Fix Exportar contactos** (`require` ESM en el job → `whatsapp-rust-bridge`) **+ filtro por conexión** | ✅ Hecho | `2026-07-07-fix-export-contactos-y-filtro-conexion.md` |
| 2026-07-07 | Quick-replies — **desactivar IA semántica** (flag) + **botón "Redactar con IA"** (endpoint nuevo) + fix footer picker | ✅ Hecho | `2026-07-07-quickreplies-ia-redactar.md` |
| 2026-07-07 | Ajustes UI — **Queues** (Prompt IA→Descripción, ocultar Orden) + **Connections** (ocultar Batería y engranaje) | ✅ Hecho | `2026-07-07-ui-queues-connections.md` |

**Reglas al reparar:** BD sagrada · no borrar código en uso · verificar con `tsc`/`build` antes de desplegar · frontend se despliega con `npm run build:prod` + `pm2 restart chateam-frontend`.
