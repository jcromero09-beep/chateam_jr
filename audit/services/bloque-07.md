# Bloque 07 — Auditoría de Servicios

Alcance: ContactServices, AICreditServices, AffiliateServices, FacebookServices, AIEntityServices, AgentEngagementServices, PlanService, FlowCampaignService, AIMultimodalServices, CompanyTokenUsageService, Billing, AttributionServices, UserQueueServices.
Modo: SOLO LECTURA. Clasificación por grupo de servicio (13), con excepciones a nivel de archivo señaladas en Riesgos.

## Tabla de clasificación

| # | Grupo | Archivos | Clase | Cableado / evidencia | Riesgo principal (ruta:línea) |
|---|-------|----------|-------|----------------------|-------------------------------|
| 1 | ContactServices | 18 | REAL | CRUD Sequelize, tenant-scoped (companyId) en la mayoría | Cross-tenant: `DeleteContactService.ts:5` (findOne solo por id, sin companyId) |
| 2 | AICreditServices | 14 | REAL | Motor de créditos: balance, deduct, refund, provision, audit `AICreditTransaction` | `DeductCreditsService.ts:119` mock-success (solo super-admin sin tipo); defaults hardcode en `CalculateCreditCostService.ts:101` |
| 3 | AffiliateServices | 11 | REAL | Wallet/retiros con `sequelize.transaction`, ownership + lock pesimista | `WithdrawalService.ts:78` fee=0 hardcode (documentado); OK |
| 4 | FacebookServices | 9 | REAL | Graph API v24.0, credenciales por company | `Math.random` solo para nombres temp (`sendFacebookMessageMedia.ts:72`), benigno |
| 5 | AIEntityServices | 7 | REAL | CRUD catálogo IA GLOBAL (sin tenant por diseño, dedupe por key) | Sin companyId es correcto (entidad global) |
| 6 | AgentEngagementServices | 6 | REAL | OpenAI real + deduct crédito, tenant-scoped | `consistencyScore` heurístico (no mock); modelo `gpt-5.5` hardcode |
| 7 | PlanService | 6 | REAL | Sync Stripe + PayPal (crea/archiva Price), planes globales | `UpdatePlanService.ts:154` console.log ruidoso |
| 8 | FlowCampaignService | 5 | REAL | CRUD FlowCampaign (tenant-scoped) | Cross-tenant: `DeleteFlowCampaignService.ts:6` sin companyId; `CreateFlowCampaignService.ts:37` retorna el error como modelo (bug) |
| 9 | AIMultimodalServices | 4 | REAL | PDF/YouTube/RSS/Vision vía APIs externas + deduct crédito | modelo `gpt-5.5` hardcode en varios |
| 10 | CompanyTokenUsageService | 3 | REAL | Agregación `CompanyTokenUsage`, tenant-scoped | Ninguno relevante |
| 11 | Billing | 2 | REAL | Conversión USD→tokens pura, validación estricta, constante centralizada | Ninguno |
| 12 | AttributionServices | 1 | **PARCIAL** | Queries Sequelize reales tenant-scoped (touchpoints/conversions/results) | **MOCK fallback:** `AttributionDashboardService.ts:473-531` datos fabricados ($86.700, 289 conv…) en catch; `:371-373` métricas hardcode (2.4/35/48) en empty-state presentadas como reales |
| 13 | UserQueueServices | 1 | REAL | Selector de agente por cola con `random()` (round-robin), scope por queueId | `random()` es intencional, no dato fabricado |

## Conteo por clase (13 grupos)

- REAL: 12
- PARCIAL: 1 (AttributionServices — con datos MOCK embebidos como fallback)
- MOCK: 0
- STUB: 0
- MUERTO: 0
- NO-VERIFICABLE: 0

Cross-tenant a nivel de archivo: **2** (`DeleteContactService.ts:5`, `DeleteFlowCampaignService.ts:6`).

## Veredicto (3 líneas)

1. La capa de dinero (AICreditServices, Billing, PlanService, AffiliateServices) es REAL, config-driven, fail-closed y transaccional con audit trail — sin cobros fabricados ni bypass indebidos (solo super-admin, con registro).
2. AttributionServices es el único PARCIAL: sus consultas son reales pero degrada a datos de venta INVENTADOS ($86.700 etc.) en error y a métricas fijas (2.4/35/48) en empty-state, que un usuario percibe como analítica real.
3. Dos servicios de borrado (`DeleteContactService`, `DeleteFlowCampaignService`) no filtran por companyId → IDOR cross-tenant si el controller no lo impone aguas arriba.

## ≤10 peores hallazgos

1. `AttributionServices/AttributionDashboardService.ts:473-531` — `getDefaultChannels()` devuelve revenue/conversiones fabricadas y se retorna en catch (`:99`, `:139`); dashboard de dinero muestra cifras falsas como reales. **(dinero + MOCK)**
2. `AttributionServices/AttributionDashboardService.ts:371-376` — métricas hardcode (avgTouchpoints 2.4, multiTouch 35%, avgConversionTime 48h) vía `|| default`; empty-state parece tener datos.
3. `ContactServices/DeleteContactService.ts:5` — `Contact.findOne({where:{id}})` sin companyId → destrucción cross-tenant de contactos. **(cross-tenant)**
4. `FlowCampaignService/DeleteFlowCampaignService.ts:6` — `FlowCampaignModel.findOne({where:{id}})` sin companyId → borrado cross-tenant de campañas. **(cross-tenant)**
5. `AICreditServices/DeductCreditsService.ts:119-127` — retorna mock-success (deducted=amount, sin balance real) cuando el super-admin usa un tipo inexistente; no cobra pero simula éxito. **(dinero)**
6. `FlowCampaignService/CreateFlowCampaignService.ts:34-37` — `catch { return error }` retorna el objeto Error tipado como `FlowCampaignModel`; falla silenciosa que rompe contrato.
7. `ContactServices/ShowContactService.ts:23-29` — chequeo `contact?.companyId !== companyId` ANTES del null-check; con contacto inexistente lanza mensaje equivocado ("otra empresa"). Bug de orden (no es hueco de seguridad).
8. `AICreditServices/CalculateCreditCostService.ts:101-116` — precios de fallback hardcode (30/45/10/15/1 tokens) si el provider no tiene pricing configurado. **(dinero, riesgo de sub/sobre-cobro)**
9. Modelo `gpt-5.5` hardcodeado en ~10 servicios IA (AgentEngagement*, AIMultimodal*, DashboardStats) — si el id de modelo no es válido en runtime, fallan todas las llamadas OpenAI. **(hardcode)**
10. `AffiliateServices/WithdrawalService.ts:78` — `fee = 0` hardcode ("sin comisión por ahora"); aceptable pero es regla de negocio embebida en código.
