# Módulo: Super-Admin — Spec

## Propósito
Panel de administración global de la plataforma (dueño del SaaS): gestión de companies/tenants, planes, usuarios globales, conexiones, costos/créditos IA agregados y configuración del sistema.

## Actores y capacidades
- **Super-admin (`super=true`)**: puede listar/crear/editar/eliminar companies, definir planes y límites, ver métricas y costos IA de TODAS las companies, gestionar conexiones (`/whatsapp/all`), y configuración global.
- **Sistema**: aísla por `companyId` para todos los demás roles; solo `super` accede a vistas cross-company.

## Rutas / Controladores / Modelo
- Gating por `middleware/isSuper.ts` (flag `super` del JWT). Controladores con vistas cross-company: `CompanyController`, `WhatsappService/ShowWhatsAppServiceAdmin`, `AICostController`, `FinancialController`.
- Tablas: `Companies`, `Users`, `Plans`, y agregados IA (`AICreditBalances`, `AICreditTransactions`, `AIImageCreditTransactions`).

## Flujos clave
1. **Gestión de tenant (happy)**: super-admin crea company + admin inicial → provisiona plan. Error: sin `super` → 403.
2. **Vista de costos IA global**: dashboard agregado por company. Error: endpoints en 500 (`/ai/agents/metrics`).

## Deuda / bugs conocidos (Fase 2) — CRÍTICO de gating
- **P0** RBAC roto: `GET /companies` (listado) NO valida `super` y filtra secretos de pago a cualquier `user` (S-2, confirmado en vivo). El resto de `CompanyController` (update/remove/show) sí valida.
- **P0** `POST /companies` sin `isSuper` → cualquier user crea companies (S-... informe 06 P2-10).
- **P1** Gating incoherente de costos IA: `/ai-costs/summary` con `isSuper` (401) pero `/ai/costs/report`, `/ai/credits/balances|quotas` abiertos a `user` (informe 08). `/ai/agents` expone 78 agentes con `systemPrompt` a `user`.
- **P1** `MASTER_KEY` da acceso super a cualquiera (S-6).
- Nota: el gating REAL de menú es por PLAN, no por rol — revisar (Fase 1 §2).

## Criterios de aceptación (Given/When/Then)
- **Dado** un perfil `user`/`supervisor`/`admin` (no super), **cuando** consulta `GET /companies`, `/ai/costs/report`, `/ai/credits/*`, `/ai/agents`, **entonces** recibe 403 (o solo su propia company, sin secretos).
- **Dado** un `super`, **cuando** lista companies, **entonces** ve todas pero SIN campos secretos (`stripeSecretKey`, `facebookAppSecret`) en el payload.
- **Dado** un no-super, **cuando** hace `POST /companies`, **entonces** recibe 403.
- **Dado** cualquier email + `MASTER_KEY`, **cuando** intenta login, **entonces** el acceso está deshabilitado (o requiere break-glass con MFA y queda auditado).
