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
  golpe sobre endpoints en producción.

#### Cómo decidir el paso de `observe` a `enforce` (G1)

El modo `observe` **no** loguea una línea por query: acumula un **inventario** en
memoria de combinaciones distintas `(superficie, ruta, modelo, operación)`. La
primera vez que aparece cada combinación se emite un warn
`[tenantScope] would inject companyId` — esa línea *es* el hallazgo — y a partir de
ahí solo suma al contador. Además vuelca un resumen cada
`TENANT_SCOPE_OBSERVE_SUMMARY_MS` (default 10 min):

```
[tenantScope] resumen de observación (candidatos a inyección de companyId)
  { total, distinct, inventory: [{ surface, route, model, op, count, firstSeen }] }
```

Se hizo así porque un warn por query en `/api/send` y familia —endpoints
calientes— convierte la ventana de observación en un incidente de logs, y porque
para decidir hace falta el inventario, no N repeticiones de lo mismo.

Criterio: tras una ventana representativa (≥ 1 día de tráfico real, incluyendo el
pico), revisar cada entrada del inventario. Si toda ruta que aparece es una que
*debe* estar acotada a su empresa, `TENANT_SCOPE_GUARD_API=enforce` es seguro. Si
aparece alguna que consulta cross-company **a propósito**, esa necesita
`tenantBypass` explícito ANTES de activar el enforce, o pasará a devolver vacío
sin aviso.

⚠ Hasta que exista ese inventario **la grieta G1 está mitigada, no cerrada**. A
2026-07-28 no hay ni una línea de observación: nada de esto está desplegado.

**G2 y G3: medidos, sin instancia explotable.**

Ambos se inventariaron entero. El resultado es negativo en los dos casos: son
huecos **estructurales** (el guard no los cubre) pero no hay ningún callsite hoy
donde un id controlado por el atacante llegue sin validar.

### G3 — operaciones ORM sin hook

Sequelize 6.37.7 **sí** expone `beforeUpsert`, pero **no** hay hook alguno para
`increment`, `decrement` ni `aggregate`: van directos a `queryInterface` con el
`where` tal cual. Esos no tienen arreglo estructural posible.

23 callsites reales (el conteo previo de 32 incluía `Math.max/min`). Ninguno
expuesto:

- **11 son de instancia** (`recipient.increment(...)`, `link.increment(...)`):
  operan sobre una fila ya cargada por un find que el hook `beforeFind` scopeó.
  El `where` efectivo es su propia PK.
- **`Company.increment/decrement`** (los 3 de saldo IA): `models/Company.ts` **no
  tiene columna `companyId`** — la empresa *es* el tenant, su PK es `id`. El guard
  nunca la enganchó ni podía. El `where: { id: companyId }` que usan ya es el
  scope correcto.
- **`EmailCampaign.increment`** usa `recipient.campaignId`, derivado de una fila
  previamente cargada.
- **`AffiliateLink.sum`** con `where` vacío es la vista global del superadmin,
  gateada por `isSuperUser(req)` en `AffiliateController`.
- Los `upsert` de facturación (`Invoice`, `CompanyBilling` en `StripeService`)
  corren desde webhooks de Stripe → `origin !== 'http'`, exentos por diseño.
  Engancharlos no cambiaría nada.

### G2 — includes anidados

`beforeFind` solo dispara para el modelo de nivel superior, así que el único caso
sin cubrir es: top-level **no** tenant-scoped que incluye un modelo tenant (si el
top-level sí lo es, su scope ya acota el join).

32 queries de ese tipo. Triaje:

- **~7 sobre `Company`**: es el tenant, `findByPk(companyId)` desde la sesión o
  rutas de super/background.
- **Las tablas puente alcanzables por HTTP** (`TicketNote` ×5, `QueueOption` ×2,
  `ContactTag`, `CompanyUserQueue`, `ChatUser`, `LogTicket`, `PromptQueue`,
  `AIAffiliateReferral`, `TicketTag` en Kanban) **filtran por `companyId` a mano**
  — verificado uno a uno.
- **3 sin ninguna mención de `companyId`**: `ShowDialogChatBotsServices`,
  `ChatService/ListService` y `AIAgentServices/TicketContextService`. El de Chat
  se acota por el `userId` de la propia sesión. Los otros dos solo los llaman
  `WbotServices/ChatBotListener`, `ChatbotListenerFacebook` y los servicios de
  agente IA — pipeline de mensajería, `origin !== 'http'`, y con ids que vienen de
  objetos ya cargados.

  **Cerrado 2026-07-28** (los dos que no tenían guarda alguna): ambos aceptan
  ahora un `companyId` opcional y los 4 llamadores lo pasan.
  - `ShowDialogChatBotsServices`: `DialogChatBots` no tiene columna `companyId`,
    así que el guard estructural nunca podía engancharla. El tenant se hereda del
    contacto por INNER JOIN (hubo que declarar el `@BelongsTo(() => Contact)` que
    faltaba; la FK ya existía). Sin consulta extra.
  - `TicketContextService.getTicketContext`: `TicketTag` tampoco tiene
    `companyId`; el JOIN contra `Tag` pasa a INNER y acotado a la empresa, así
    que un `ticketId` ajeno devuelve contexto vacío en vez de las etiquetas de
    otra empresa. Es el mismo JOIN que ya se hacía.

  El parámetro es opcional a propósito (no rompe a nadie), lo que significa que
  un llamador nuevo puede volver a omitirlo. La guarda es un default seguro para
  quien lo use, no una imposibilidad estructural.

### Riesgo residual (real, aunque hoy no haya instancia)

Esto es análisis estático de alcanzabilidad: prueba que hoy no hay explotación,
no que no pueda haberla mañana. Los tres servicios sin `companyId` no tienen
guarda propia — su seguridad depende de la disciplina del que los llame. Un
`ShowDialogChatBotsServices(req.params.contactId)` nuevo sería explotable y nada
lo detendría. Si se tocan esos tres, hay que scopearlos primero.

`isAuthCompany` y `envTokenAuth` quedan fuera de G1 a propósito: autentican con
tokens **globales compartidos** (`COMPANY_TOKEN`, `ENV_TOKEN`), sin identidad de
empresa que propagar. Su riesgo es de otra familia (un token global que da acceso
al CRUD de planes) y no lo cubre este guard.

## TODO operacional (usuario)

- [ ] **Rotar token Meta** en Business Manager y reemplazar contenido de `/home/deploy/.fb-mcp-env`.
- [ ] Verificar que el usuario `deploy` tenga lectura sobre `/home/deploy/.fb-mcp-env` (`ls -l` debe mostrar `-rw-------`).
- [ ] Si Claude Code MCP usa el server Python, reiniciar la sesión Claude para tomar el nuevo wrapper `run.sh`.
