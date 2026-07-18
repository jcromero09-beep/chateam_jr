# Agente IA · Meta Ads Optimizer

> **Versión**: 1.0.0 · **Fecha**: 2026-05-04
> Agente IA que analiza y opera campañas Meta Ads de cada company desde ChatEAM, con cinturón de seguridad multi-tenant y modo plan + execute.

---

## Resumen ejecutivo

El agente vive integrado dentro de **/campaigns/audit** (`CampaignsAudit.tsx`). El usuario escribe lenguaje natural, el agente:

1. **Analiza** sus campañas Meta llamando tools de lectura sobre `MetaMarketingService`.
2. **Propone acciones** (pause/update/duplicate/create) que se persisten en `MetaAgentPlans` con TTL 15 min.
3. **Ejecuta** sólo cuando el usuario confirma desde la UI, con guardrails (≤ 5 acciones, +20% budget máx, whitelist de objetivos, status PAUSED forzado en duplicate/create).

```
Usuario → CampaignsAudit.tsx → POST /agent/plan → planAction()
                                                    ↓
                                  OpenAI (function calling, dryRun)
                                                    ↓
                          MetaAdsToolset · 4 read · 3 write (interceptadas)
                                                    ↓
                                  MetaAgentPlan (BD) · proposedActions[]
                                                    ↓
                            Usuario revisa → POST /agent/execute
                                                    ↓
                          MetaMarketingService.* (con ownership multi-tenant)
                                                    ↓
                                 MetaAgentActionLog (audit por acción)
```

---

## Arquitectura

### Backend
| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Routes | [routes/metaMarketingRoutes.ts](../routes/metaMarketingRoutes.ts) | `/meta-marketing/agent/{plan,execute,plans,plans/:id,connections}` |
| Controller | [controllers/MetaAdsAgentController.ts](../controllers/MetaAdsAgentController.ts) | HTTP wrappers con `extractError()` |
| Service | [services/AIAgentServices/MetaAdsAgentService.ts](../services/AIAgentServices/MetaAdsAgentService.ts) | `planAction()` · `executePlan()` · `listPlans()` · `getPlan()` · `listMetaConnections()` |
| Toolset | [services/AIAgentServices/MetaAdsToolset.ts](../services/AIAgentServices/MetaAdsToolset.ts) | 7 tools registradas con `kind: read/write` |
| Tool dispatcher | [services/AIAgentServices/ToolExecutor.ts](../services/AIAgentServices/ToolExecutor.ts) | + flag `dryRun` (writes capturadas como `proposedAction`) |
| Tool registry | [services/AIAgentServices/ToolRegistry.ts](../services/AIAgentServices/ToolRegistry.ts) | + campo `kind` en `ToolDefinition`; + `adAccountId/metaWhatsappName` en `ToolContext` |
| LLM | [services/AIClientService.ts:620](../services/AIClientService.ts#L620) | `chatCompletionWithTools()` (OpenAI nativo) |
| Cobro | [services/AICreditServices/AIUsagePricingService.ts](../services/AICreditServices/AIUsagePricingService.ts) | `chargeCampaignAnalysis()` en plan, `chargeAgentExecution()` en execute |
| Resolver creds | [services/MetaMarketingService/index.ts:133](../services/MetaMarketingService/index.ts#L133) | `getCompanyMetaConfig(companyId, whatsappId?)` (multi-tenant) |
| Modelos | [models/MetaAgentPlan.ts](../models/MetaAgentPlan.ts) · [models/MetaAgentActionLog.ts](../models/MetaAgentActionLog.ts) | Persistencia |
| Migraciones | `database/migrations/20260504120001-create-meta-agent-plans.ts` · `…120002-create-meta-agent-action-logs.ts` · `…130001-seed-meta-ads-optimizer-agent.ts` | BD SAGRADA — solo CREATE/INSERT idempotente |

### Frontend
| Capa | Archivo |
|------|---------|
| Service API | [frontend/src/services/metaAdsAgentService.ts](../frontend/src/services/metaAdsAgentService.ts) |
| Modal de plan | [frontend/src/components/MetaAgentPlanCard.tsx](../frontend/src/components/MetaAgentPlanCard.tsx) |
| Página integrada | [frontend/src/pages/CampaignsAudit.tsx](../frontend/src/pages/CampaignsAudit.tsx) (Card del agente al inicio + modal) |
| RBAC | módulo `campaigns_audit` heredado (la sección agente vive dentro) |

---

## Multi-tenancy y resolución de credenciales

Cada company tiene credenciales Meta en **dos capas**:

1. **Capa A — Por conexión** (`Whatsapp.tokenMeta`, `Whatsapp.facebookAdAccountId`).
2. **Capa B — Por company** (`CompaniesSettings.facebookSystemUserToken`, `facebookAdAccountId`).

El agente delega la resolución a `MetaMarketingService.getCompanyMetaConfig(companyId, whatsappId?)`, que filtra por `companyId` y aplica fallback A→B.

**Snapshot anti-rotación**: cuando se crea un plan, se guarda `resolvedAdAccountId` y `resolvedMode` en `MetaAgentPlans`. Si las credenciales cambian entre `plan` y `execute`, el segundo rechaza con `STALE_CREDENTIALS` (HTTP 409).

**Inyección segura**: `ToolExecutor` recibe `context: { companyId, whatsappId, adAccountId }` desde el service. Las tools NUNCA aceptan estos campos desde los `args` del modelo — eso evita prompt-injection cross-tenant.

---

## Whitelist de tools

| Tool | kind | Servicio destino | Guardrail |
|------|------|------------------|-----------|
| `list_campaigns` | read | `getCampaigns({ companyId, whatsappId })` | filtro estricto `companyId` |
| `get_campaign_insights` | read | `getAggregatedInsights` | `date_preset` ∈ whitelist; rango ≤ 90 días |
| `get_ads_by_campaign` | read | `getAds({ campaignId })` | — |
| `pause_campaign` | write | `pauseAllInCampaign` | máx 5 acciones por plan |
| `update_campaign_budget` | write | `updateCampaign({ daily_budget })` | `nuevo ≤ actual × 1.20` |
| `duplicate_campaign` | write | `duplicateCampaign` + `updateCampaign(status:PAUSED)` | resultado siempre PAUSED |
| `create_campaign_paused` | write | `createCampaign({ status: 'PAUSED' })` | `objective` ∈ 6 outcomes whitelist |

Bloqueadas explícitamente (no registradas, no invocables): `delete_campaign`, `activate_*`, `mass_edit`.

---

## Flujo: plan → execute

### POST /meta-marketing/agent/plan
```jsonc
// Request
{
  "prompt": "lista mis 5 campañas con peor CPL los últimos 7 días y propone pausar las que tengan gasto sin conversiones",
  "whatsappId": 10              // opcional, si la company tiene varias conexiones
}

// Response
{
  "success": true,
  "data": {
    "planId": 42,
    "summary": "Encontré 2 campañas con $X gastado y 0 conversiones en 7 días...",
    "proposedActions": [
      {
        "id": "uuid-1",
        "action": "pause_campaign",
        "params": { "campaign_id": "23851234", "reason": "CPL > $15 sin leads" },
        "reason": "CPL > $15 sin leads",
        "riskLevel": "low"
      }
    ],
    "requiresConfirmation": true,
    "expiresAt": "2026-05-04T18:35:00.000Z",
    "account": {
      "adAccountId": "act_123456789",
      "whatsappId": 10,
      "whatsappName": "nominapp",
      "mode": "whatsapp"
    }
  }
}
```

### POST /meta-marketing/agent/execute
```jsonc
// Request — confirmActionIds es opcional; si se omite, ejecuta todas
{
  "planId": 42,
  "confirmActionIds": ["uuid-1", "uuid-3"]
}

// Response
{
  "success": true,
  "data": {
    "planId": 42,
    "status": "executed",          // executed | partial | already_executed
    "alreadyExecuted": false,
    "executedActions": [
      { "id": "uuid-1", "action": "pause_campaign", "success": true }
    ],
    "skippedActions": ["uuid-2"]
  }
}
```

---

## Feature flags y costos

| Variable | Default | Efecto |
|----------|---------|--------|
| `META_AGENT_EXECUTE_ENABLED` | `false` | Si `false`, `/agent/execute` devuelve 503. Habilita después de cerrar la deuda de seguridad (token rotado, audit completo). |

Cobros (vía `AIUsagePricingService`):
- `plan` → cobra **1 unidad** de `campaign_analysis` (fail-closed: 402 si no hay créditos).
- `execute` → cobra **N unidades** de `agent_execution` donde N = acciones exitosas.

Modelo OpenAI: `gpt-4.1-mini` (configurable por company en `AIAgentConfig.modelKey`).

---

## Verificación / Smoke test

```bash
# 0. Pre-requisitos de seguridad
grep -R "EAA4Cx" /home/deploy/                                  # → 0 resultados
ls /home/deploy/chateam_jr/services/SendToMCPService 2>&1       # → No such file
grep -nE "Whatsapp\.findByPk\(" /home/deploy/chateam_jr/controllers/ApiController.ts  # → 0 resultados

# 1. Tablas y agente en BD
psql -c "SELECT id, status, \"createdAt\" FROM \"MetaAgentPlans\" ORDER BY id DESC LIMIT 5;"
psql -c "SELECT slug, \"isActive\", jsonb_array_length(tools::jsonb) FROM \"AIAgentConfigs\" WHERE slug='meta-ads-optimizer';"

# 2. Endpoints registrados (devuelven 401 sin auth — confirma rutas vivas)
curl -m 5 -o /dev/null -w "%{http_code}\n" http://localhost:3002/meta-marketing/agent/connections   # 401
curl -m 5 -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3002/meta-marketing/agent/plan   # 401

# 3. Logs en vivo durante prueba real
pm2 logs node-1 --lines 200 --nostream | grep -E "MetaAdsAgent|MetaAdsToolset|AICreditTransaction"

# 4. Tools registradas (smoke in-process)
node -e 'const r=require("/home/deploy/chateam_jr/dist/services/AIAgentServices/ToolRegistry").default; console.log(r.listTools().filter(t=>["list_campaigns","pause_campaign"].includes(t)));'
```

---

## Consideraciones de seguridad

1. **BD SAGRADA**: las migraciones solo `CREATE TABLE IF NOT EXISTS` y `INSERT WHERE NOT EXISTS`. Sin DELETE/DROP/TRUNCATE.
2. **Tokens Meta**: nunca pasan por logs ni respuestas API; se resuelven internamente en `MetaMarketingService.getMetaClient()`.
3. **Cross-tenant**: tres validaciones en cadena:
   - Controller → `req.user.companyId` siempre desde JWT.
   - Service → `MetaMarketingService.getCompanyMetaConfig` filtra por `companyId`.
   - Tools → reciben `companyId` solo desde `context`, nunca desde `args` del LLM.
4. **Idempotencia**: `executePlan` usa `LOCK.UPDATE` en transacción. Doble click devuelve `alreadyExecuted: true` sin duplicar acciones.
5. **TTL del plan**: 15 min. Después se rechaza con `ERR_PLAN_EXPIRED`.
6. **Audit completo**: cada ejecución produce 1 fila en `AICreditTransaction` (cobro) + N en `MetaAgentActionLog` (acción Meta + `request_id` para soporte).

---

## Roadmap V2 (out of scope este sprint)

- Tool-use Anthropic en `AIClientService` (hoy solo OpenAI). Cuando se soporte, agregar Claude como "estratega" con fallback a OpenAI ejecutor.
- Reemplazar adaptador interno por **cliente MCP remoto oficial** (`mcp.facebook.com/ads`) — el `MetaAdsToolset` queda detrás de interfaz `IMetaAdsAdapter` para que el swap sea transparente.
- Cifrado AES-256 de `Whatsapp.tokenMeta` en BD.
- Auto-trigger del agente desde reglas (sin prompt humano).
- Generación automática de copy/creativos para `create_campaign_paused`.

---

## Lecciones (para `tasks/lessons.md`)

1. **`agentType` STRING(50)** sin constraint en BD permite extender categorías (`meta_ads_optimizer` no estaba en el union TS, pero la BD acepta cualquiera). Para que TS quede consistente, los services usan `slug` como identificador, no `agentType`.
2. **Compilación con dist/scripts**: el runner `runMigrations.ts` necesita detectar bien el `__dirname` cuando vive dentro de `dist/`. Bug arreglado: `isRunningFromDist` + filtro defensivo `!.endsWith(".d.ts")`.
3. **`getCampaignById` no acepta `whatsappId`**: para el guardrail +20% en `update_campaign_budget`, fallback graceful con warn-log si la lectura previa falla.
4. **Tool registry global**: `MetaAdsToolset.registerMetaAdsTools()` es idempotente — flag `registered` evita doble registro al hot-reload.
