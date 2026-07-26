# W0-INV-10 — EXPLAIN de las queries lentas (dashboard / moments)

> Ola 0 (INV) · 2026-07-26 · Read-only (`EXPLAIN ANALYZE` sobre la BD viva, empresa con más datos
> = company 8). Cierra el INV de rendimiento del plan.

## Resultado: los índices están SANOS; el problema es 100% capa aplicación

| Query | Plan real | Tiempo BD |
|---|---|---|
| `count(*) Tickets WHERE companyId+status` | Index Only Scan `tickets_flow_state_idx` | **2 ms** |
| `count(*) Messages WHERE companyId` (79k filas) | Index Only Scan `messages_company_id` | **19 ms** |
| moments: `count(DISTINCT) Tickets + 3 LEFT JOIN` (comp8, 2.046 tickets) | Bitmap Index Scan `idx_tickets_company` | **15 ms** |

Índices presentes y usados: `idx_tickets_company`, `tickets_flow_state_idx`, `tickets_status`,
`messages_company_id`, etc. **Ninguna query hace seq scan.**

## Conclusión (raíz confirmada, NO es indexación)
- **Dashboard 2.629 ms (NFR-001):** son **~15 `.count()` secuenciales sin caché**; cada uno es rápido
  (2-19 ms) pero en serie + round-trips suman segundos. → fix = **caché/paralelizar (W6-PERF-01)**, no
  indexar.
- **`/dashboard/moments` 8.067 ms (NFR-002):** el SQL tarda 15 ms; el resto es **Sequelize hidratando
  2.046 tickets con includes (Contact/User/Queue) SIN `limit`** + serialización + transferencia del
  array completo. → fix = **paginación server-side (W6-PERF-02)**, no indexar.

## Impacto en el plan
- **W6-PERF-01/02 confirmadas** como los fixes correctos; **descartado** trabajo de índices para estas
  rutas (los índices ya son óptimos). Esto reduce el alcance/riesgo de esas tareas.
