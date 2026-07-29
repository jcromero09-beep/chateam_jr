# Security Debt — Cross-Tenant `Whatsapp.findByPk` residual

> **Última auditoría**: 2026-05-04 (Fase 0 — Sprint Meta Ads Agent)
> **Severidad residual**: BAJA (todos los callers actuales reciben `whatsappId` desde objetos previamente filtrados por `companyId`)

## Cerrados en este sprint

| Archivo | Línea | Cambio |
|---------|-------|--------|
| `controllers/ApiController.ts` | 111 | `findByPk → findOne({ id, companyId })` |
| `controllers/ApiController.ts` | 1973 | `findByPk → findOne({ id, companyId })` |
| `controllers/MessageController.ts` | 814 | `findByPk → findOne({ id, companyId: ticket.companyId })` |
| `controllers/MessageController.ts` | 1351 | `findByPk → findOne({ id, companyId: messageData.companyId })` (+ validación previa) |
| `controllers/CoexistencePolicyController.ts` | 107, 110 | `findByPk → findOne({ id, companyId })` |

## Deuda residual (services internos)

Estos calls ocurren en services que reciben `whatsappId` desde objetos ya filtrados por `companyId` upstream (ticket.whatsappId, campaign.whatsappId, etc.). Riesgo bajo pero deben endurecerse en próximo sprint:

- `services/CampaignService/RestartService.ts:35` — `campaign.whatsappId` (campaign filtrado upstream)
- `services/MessageServices/ProcessPendingMessagesService.ts:19,157`
- `services/IntegrationsServices/clasificarEtapaCliente.ts:185` — `ticket.whatsappId`
- `services/CoexistenceServices/OutboundRoutingService.ts:91,153`
- `services/MetaServices/metaEmbeddedSignupService.ts:391` — token refresh
- `services/MetaServices/metaSmbMessageEchoesService.ts:64`
- `services/MetaServices/MetaMessageForwardService.ts:110`
- `services/MetaServices/BaileysToMetaMigrationService.ts:78`
- `services/MetaServices/metaMessageListener.ts:832`
- `services/FacebookServices/igMessageListener.ts:59`
- `services/FacebookConversionService/SendConversionEvent.ts:42`
- `services/FacebookConversionService/SyncDatasets.ts:280`
- `services/WhatsappService/ShowWhatsAppService.ts:46` — autorizado por controller
- `services/WhatsappService/ShowWhatsAppServiceAdmin.ts:43` — solo super admin
- `services/WhatsappService/ImportWhatsAppMessageService.ts:33,70`
- `services/WhatsappService/uploadMediaAttachment.ts:15,35`

## Otra deuda crítica

### Token `Whatsapp.tokenMeta` en BD plano (P1)
- **Archivo**: `models/Whatsapp.ts:133`
- **Riesgo**: Lectura BD → exposición masiva de tokens Meta de todas las companies.
- **Fix futuro**: Cifrado AES-256 con key en KMS / `process.env.ENCRYPTION_KEY`. Requiere migración de datos existentes.

### Token Meta en Embedded Signup (P2)
- **Archivo**: `services/MetaServices/metaEmbeddedSignupService.ts`
- **Detalle**: Logs en producción podrían filtrar tokens en stdout. Auditar `console.log` + reemplazar por logger con sanitización.

## Cerrados en este sprint (artefactos eliminados)

| Archivo | Razón |
|---------|-------|
| `services/SendToMCPService/SendToMCPService.ts` | Payload prueba comprometedor pidiendo "usuarios y contraseñas sin hash" |
| `routes/mcpRoutes.ts` | Ruta no registrada pero apuntaba al controller comprometido |
| `controllers/MCPController.ts` | Stub no usado, asociado a SendToMCPService |
| Token Meta en `/home/deploy/.mcp.json` (argv) | Movido a `/home/deploy/.fb-mcp-env` (chmod 600) + wrapper `run.sh` + env-var `FB_MCP_TOKEN` |

## Guard de aislamiento multi-tenant — auditoría 2026-07-28

Auditoría de `helpers/tenantScope.ts` (guard estructural [W1-SEC-IDOR]).

**Verificado en orden:**
- `TENANT_SCOPE_GUARD` default = `enforce`. No está en modo permisivo.
- El contexto se puebla bien: `traceIdMiddleware` crea el store de AsyncLocalStorage
  (`app.ts`, antes de `app.use(routes)`) y `middleware/isAuth.ts:111` le inyecta
  `companyId`/`super` tras validar el JWT.
- El escape hatch `tenantBypass` está declarado en `TraceContext` pero **no se usa
  en ningún sitio del repo**. Cero bypasses por esa vía.
- 7 ficheros de modelo con `companyId` no están en `addModels` (→ sin hooks), pero
  los 7 tienen **0 consumidores**: `ApplePurchase`, `LeadSource`, `Media`,
  `Appointments/AppointmentService` (duplicado del registrado, mismo `tableName`),
  y los 3 de `WebChat/`. Es código muerto, no exposición.

**Cerrado en este sprint:**
- **La superficie de la API pública quedaba inerte.** `middleware/tokenAuth` (rutas
  `/api/send`, `/send-template`, `/checkNumber`…) autenticaba por token de conexión
  pero **no propagaba `companyId`** al contexto → `applyScope` salía en
  `ctx.companyId == null` y el guard no actuaba. `ApiController` filtra a mano
  correctamente (deriva `companyId` de `whatsapp.companyId` y valida el
  `whatsappId` del body con `where:{id, companyId}` + 404), así que no había fuga
  actual; pero la red estructural no cubría esa superficie. Ahora `tokenAuth`
  propaga el contexto con `tenantSurface: 'api'`, y esa superficie tiene su propio
  modo `TENANT_SCOPE_GUARD_API` (**default `observe`**) para no activar el guard de
  golpe sobre endpoints en producción. Pasar a `enforce` cuando los logs
  `[tenantScope] would inject companyId` con `surface: "api"` confirmen que no hay
  sorpresas.

**Deuda abierta (medida, no arreglada):**

| # | Gap | Medida | Notas |
|---|-----|--------|-------|
| G2 | Los `include` anidados no se scopean | sin inventariar | `beforeFind` solo dispara para el modelo de nivel superior. El caso peligroso es acotado: top-level NO tenant-scoped que incluye un modelo tenant (si el top-level sí lo es, su scope ya protege el join). Falta inventariar cuántos hay. |
| G3 | Operaciones ORM sin hook | **32 callsites** | `upsert`, `increment`, `decrement` y `aggregate` no disparan ninguno de los 4 eventos enganchados (`beforeFind`, `beforeCount`, `beforeBulkDestroy`, `beforeBulkUpdate`). Varias son adyacentes a dinero: `Invoice.upsert`, `CompanyBilling.upsert`, `Company.increment('aiTokenBalance')`. |

`isAuthCompany` y `envTokenAuth` quedan fuera de G1 a propósito: autentican con
tokens **globales compartidos** (`COMPANY_TOKEN`, `ENV_TOKEN`), sin identidad de
empresa que propagar. Su riesgo es de otra familia (un token global que da acceso
al CRUD de planes) y no lo cubre este guard.

## TODO operacional (usuario)

- [ ] **Rotar token Meta** en Business Manager y reemplazar contenido de `/home/deploy/.fb-mcp-env`.
- [ ] Verificar que el usuario `deploy` tenga lectura sobre `/home/deploy/.fb-mcp-env` (`ls -l` debe mostrar `-rw-------`).
- [ ] Si Claude Code MCP usa el server Python, reiniciar la sesión Claude para tomar el nuevo wrapper `run.sh`.
