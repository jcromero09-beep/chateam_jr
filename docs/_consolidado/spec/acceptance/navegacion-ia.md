# Aceptación — Navegación y Arquitectura de Información

> Spec: [`spec/modules/navegacion-ia-spec.md`](../modules/navegacion-ia-spec.md) · Plan: [`plan/PLAN-FASE-3-NAVEGACION.md`](../../plan/PLAN-FASE-3-NAVEGACION.md)
> Regla: **evidencia antes de afirmar**. Ningún `[x]` sin comando/sonda/acta pegada.

---

## A. Invariante de no-pérdida (bloqueante — §6 del spec)

- [ ] **A1** El set de rutas alcanzables post-rediseño **⊇** el set actual (104).

```bash
# Antes del cambio (baseline) y después; la diferencia debe ser vacía.
cd frontend/src
grep -oE "path: '[^']+'" components/AppLayout.tsx | sed "s/path: //" | tr -d "'" | sort -u > /tmp/nav_after.txt
comm -23 /tmp/nav_before.txt /tmp/nav_after.txt   # DEBE imprimir 0 líneas
```

- [ ] **A2** Toda ruta que salió del nav visible es alcanzable por hub o command palette (lista explícita, ruta por ruta).
- [ ] **A3** Cero rutas huérfanas nuevas: cada `path` del menú resuelve a una `<Route>` existente.

## B. Simplificación (§7 del spec)

- [ ] **B1** Rol agente: **≤7** destinos visibles en el nav de primer nivel.
- [ ] **B2** Ningún ítem `super`/`admin` aparece en el nav operativo del agente.
- [ ] **B3** Profundidad máxima 2 niveles (hoy hay 19 grupos desplegables).

```bash
# Conteo de destinos visibles por rol — sonda en vivo (Playwright, cuenta qa-agent)
# Debe reportar <= 7 para el rol agente.
```

## C. Validación con usuarios (§P6 — bloqueante antes de escribir código)

- [ ] **C1** **Tree testing** de la IA propuesta con **≥5 usuarios** (prototipo/papel, sin código).
- [ ] **C2** Acierto de 1ª elección **≥70%** en las tareas core (abrir un ticket, ver un contacto, configurar una conexión, lanzar una campaña).
- [ ] **C3** Etiquetas ambiguas identificadas y renombradas (registrar el antes/después de cada una).
- [ ] **C4** Acta por sesión: tarea, ruta esperada, ruta tomada, éxito/fallo, cita textual del usuario.

> **Criterio de corte**: si C2 < 70%, la IA **no pasa** a implementación. Se itera en papel — es 100×
> más barato que iterar en código.

## D. Validación post-implementación

- [ ] **D1** Test moderado con **≥5 usuarios** (idealmente los mismos que reportaron la confusión).
- [ ] **D2** Tasa de éxito en tarea **≥80%** sin ayuda.
- [ ] **D3** Baseline de "tiempo hasta 1ª acción útil" registrado (no había medición previa).
- [ ] **D4** Ningún usuario reporta "no encuentro X" sobre una opción que existía antes (regresión de §6).

## E. No-regresión técnica

- [ ] **E1** `npx tsc --noEmit -p frontend/tsconfig.json` limpio.
- [ ] **E2** `bash scripts/ci-gate.sh` → 🟢 GATE VERDE (los 4 pasos).
- [ ] **E3** a11y: axe critical=0 y serious=0 en el shell (nav es navegación primaria: `aria-current`, foco, skip-link, target size ≥24px).
- [ ] **E4** Nav operable **solo con teclado**; command palette accesible y anunciada.
- [ ] **E5** Gating intacto: menú de `super` vs agente sigue difiriendo por `canAccess`/`hasFeature` (sonda: contar ítems con ambas cuentas).
- [ ] **E6** Responsive: nav usable a 390px (off-canvas ya existente no se rompe).

## F. Documentación

- [ ] **F1** Bloque PROGRESO en el plan con evidencia pegada.
- [ ] **F2** `spec/benchmark.md` actualizado con la tabla de IA de competidores (nº de destinos de primer nivel).
- [ ] **F3** Gap **G6 (onboarding pobre)** del benchmark referenciado/cerrado o explícitamente diferido.
