# W0-INV-09 — Límite de sesiones WhatsApp/nodo bajo carga (DIFERIDO con motivo)

> Ola 0 (INV) · 2026-07-24 · **NO EJECUTADO** pese a autorización. Decisión de seguridad operativa.

## Por qué no se ejecutó contra producción

Una prueba de carga que empuja las sesiones Baileys hacia `MAX_SESSIONS=60` sobre el sistema **vivo**
es outward-facing y difícil de revertir:
- `chateam-node` corre **21 sesiones reales** ahora (medido en la sonda H-01: `sessions:21`); saturarlas
  puede **desconectar WhatsApp de tenants reales** y forzar re-escaneo de QR.
- El NAS está a **load 6.84 / 4 cores** (saturado) y tiene un patrón documentado de
  **reboot-por-saturación** (memoria `reference_nas_watchdog_saturacion`) que tumbaría también a los
  demás proyectos co-residentes.
- No hay entorno de staging aislado para Baileys; el test tocaría el mismo Redis/PG de producción.

"No destructivo" no se sostiene aquí: saturar sesiones **es** degradar el servicio.

## Enfoque acotado propuesto (requiere ventana + tu OK explícito para ESTE test)
1. Ventana de baja carga (load < 2) y aviso previo.
2. Instancia/nodo **aislado** (`NODE_ID` separado, Redis/PG de prueba) — no el `node-1` productivo.
3. Rampa acotada (p. ej. 5→10→20→30 sesiones de números de prueba) con corte automático si RAM
   libre < 2 Gi o load > 4.
4. Métrica objetivo: memoria/CPU por sesión y punto de degradación, para fijar `MAX_SESSIONS` real.

## Clasificación
- **NFR-011 = NO VERIFICABLE** hoy; se mantiene como INV, condicionado a entorno aislado. No bloquea
  los P0/P1 de seguridad.
