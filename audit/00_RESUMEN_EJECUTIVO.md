# 00 — Resumen ejecutivo de la auditoría integral — chateam_jr

> 2026-07-23 · Auditoría multiagente SOLO LECTURA (10 dominios técnicos + 3 de seguridad
> especializada). Confronta `spec/SPEC.md` y `product/*` contra el código real. Cierra el
> `00_RESUMEN_EJECUTIVO.md` que la ronda previa dejaba citado pero ausente.
> Regla aplicada: **medir, no opinar** — se confrontó el código de HOY; donde la SPEC quedó
> desactualizada se marca OBSOLETO en vez de arrastrar el error.

## 1. Veredicto

**El sistema es más sólido de lo que la SPEC (2026-07-12) declaraba, pero sigue NO apto para operar
`live` sin cerrar los P0 de aislamiento multi-tenant.** La amplitud funcional es real; el problema es
**gobierno de seguridad, contratos y observabilidad** — coincide con la tesis de la Fase 1 («no es
falta de features, es gobierno»).

Desde la SPEC, el equipo **corrigió** buena parte de los P0 originales (webhooks de pago firmados,
fugas de secretos en `/companies` y `/settingsFacebook`, financiero tras `isSuper`, rate-limit,
`xlsx` parcheado, bundle code-split, worker levantado). Pero la auditoría de HOY **destapa 3 P0
nuevos de aislamiento cross-tenant** que la SPEC no tenía.

## 2. Los 3 P0 vivos (detalle en `SEGURIDAD_MODELO_AMENAZAS.md`)

1. **Socket.IO sin autenticar el handshake** → cualquiera abre `wss://host/<companyId>` y recibe en
   vivo mensajes/tickets/contactos de cualquier empresa (`libs/socket.ts:125-130`).
2. **`/public` servido sin auth ni tenant** → descarga no autenticada de media cross-tenant, incl.
   comprobantes de pago; URLs adivinables (`app.ts:136-155`).
3. **IDOR `LogTickets`** → historial de tickets de otra empresa con `ticketId` secuencial
   (`ShowLogTicketService.ts:15-18`).

Causa raíz común: la **frontera de tenant no es un control**, solo una convención por-query
(`tenantMiddleware` montado en **0** rutas).

## 3. Estado por dominio

| Dominio | Parte | Señal principal |
|---|---|---|
| Arquitectura | `parts/arquitectura.md` | 3 entrypoints/ecosystems coexisten; `tenantMiddleware`=0; `wbotMessageListener` 6.764 líneas; modelos huérfanos llamados desde rutas montadas |
| Frontend | `parts/frontend.md` | 3 design systems; zonas MOCK (Leads, AppointmentsReports, Integraciones); bundle ya code-split; P0 `fetch` en página huérfana |
| APIs (inventario) | `parts/api-inventario.md` | Superficie real ~1.150 (no 891); RBAC fino 0/891; 3 agujeros de acceso directo (ronda previa) |
| APIs (contratos) | `parts/api-contratos.md` | Envelope: 82 vs 85 vs mixto, sin helper (NFR-020 AUSENTE); sin `/v1`; webhooks mixtos |
| Backend/Canales | `parts/backend-canales.md` | 15 hallazgos; firmas de webhook ausentes/rotas; secretos de canal en claro; 753 mensajes Meta perdidos |
| Base de datos | `parts/db-esquema.md` | **42/100**; 199 tablas, 41% sin un solo insert; 23 modelos ≠ tabla; 0 soft-delete; IDOR `LogTickets` |
| Seguridad core | `parts/seguridad.md` | 4/6 P0 SPEC corregidos; 2 vivos (bcrypt 8, secretos en claro) + IDOR créditos IA |
| AppSec | `parts/seguridad-appsec.md` | **P0 Socket.IO**; uploads sin límite; sesión robusta; XSS/SQLi mitigados |
| Privacidad | `parts/seguridad-privacidad.md` | **P0 `/public`**; creds Baileys en Redis en claro; olvido lógico; 9 asuntos jurídicos |
| DevOps | `parts/devops.md` | worker ONLINE; `/metrics` 404; scripts deploy/backup obsoletos; CI no dispara en rama viva |
| QA | `parts/qa.md` | CI roto (migrate sin build); tests integración placeholder; e2e con creds hardcodeadas; cobertura NV |
| Rendimiento | `parts/rendimiento.md` | NFR-001/002/016 incumplen; dashboard ~15 count sin caché; N+1 sin `limit` |
| Flutter/Móvil | — | **N/A** — sin `pubspec.yaml` en el repo |

## 4. Conteo global (matriz `MATRIZ_SPEC_VS_REALIDAD.md`)

55 requisitos: **EXISTE 15 · PARCIAL 22 · AUSENTE 8 · INCUMPLE 3 (NFR de rendimiento) · NO
VERIFICABLE 3 · MOCK 1 (dentro de FR-007)**; ≥5 afirmaciones de la SPEC corregidas a OBSOLETO.

Severidad seguridad: **3 P0 · 8 P1 · ~11 P2/residuales**; controles sólidos ya presentes que **no se
deben reconstruir** (ciclo de sesión, JWT, webhooks Stripe/PayPal/fal.ai, XSS/SQLi, TLS).

## 5. Límites de la auditoría (NO VERIFICABLE)

- No se ejecutaron builds, `tsc`, tests, `npm audit`, cargas ni peticiones autenticadas nuevas
  (modo read-only; sin autorización). Los "500" y la cobertura son de la sonda previa, no re-medidos.
- `.env` de producción bloqueado → valores reales de `META_SIGNATURE_MODE`, `STRIPE_WEBHOOK_SECRET`,
  `ENCRYPTION_KEY` y estado de migración de secretos a `enc:v1:` = NO VERIFICABLE.
- Hallazgos H-01/H-06 de `api-inventario` (ronda previa) requieren re-confirmación contra el código
  actual (divergen del re-chequeo de `seguridad.md`).
- Cobertura `companyId` en ~120 servicios: muestreo, no exhaustivo.

## 6. Cierre

Auditoría completa; **no se propone plan de implementación** (queda para la Fase Plan, sujeta a
aprobación). Entregables: `audit/parts/*.md` (12), `audit/MATRIZ_SPEC_VS_REALIDAD.md`,
`audit/SEGURIDAD_MODELO_AMENAZAS.md`, este resumen.
