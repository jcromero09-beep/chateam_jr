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

## TODO operacional (usuario)

- [ ] **Rotar token Meta** en Business Manager y reemplazar contenido de `/home/deploy/.fb-mcp-env`.
- [ ] Verificar que el usuario `deploy` tenga lectura sobre `/home/deploy/.fb-mcp-env` (`ls -l` debe mostrar `-rw-------`).
- [ ] Si Claude Code MCP usa el server Python, reiniciar la sesión Claude para tomar el nuevo wrapper `run.sh`.
