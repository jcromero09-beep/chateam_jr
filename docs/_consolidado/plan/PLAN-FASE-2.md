# PLAN FASE 2 — ChaTeam Marketing Suite (Meta Ads 2026 + CAPI + Motor Estadístico)

> **Método**: spec-first. Cada ítem crea su `spec/modules/<x>-spec.md` + `spec/acceptance/<x>.md` **antes** de codificar.
> **Fuente**: spec "ChaTeam — Módulo de Gestión de Campañas de Marketing e Integración 100% con Meta API" (v1.0, Jul 2026, CODEPLUS) confrontado contra el código real de chateam_jr (auditoría 2026-07-13, 5 agentes paralelos).
> **Regla de oro del confronte**: chateam **NO es greenfield** — ya tiene una base Meta/CAPI madura. Este plan cierra SOLO los gaps confirmados; no re-construye lo que existe.

---

## 0. Reconciliación de arquitectura (spec vs realidad)

El spec asume un stack que **no es** el de chateam. Adaptaciones obligatorias:

| Spec dice | chateam real | Decisión |
|---|---|---|
| Backend **NestJS** con módulos | **Express 4 + Sequelize + sequelize-typescript** | Mantener Express; "módulos" = carpetas `services/<Dominio>Service/` + `controllers/` + `routes/`. NO migrar a NestJS. |
| Colas **BullMQ** | **Bull** (`queues.ts`, `jobs/`) | Usar Bull existente (ya tiene attempts:5 exponencial + retry-failed). Añadir **DLQ persistente** (hoy borra fallidos a 24h). |
| Motor stats **Python (pandas/statsmodels/scipy)** o Node | Nada formal (LLM+heurísticas) | **Sidecar Python FastAPI** al estilo del `timesfm-bridge:8540` ya existente en el NAS → nuevo `stats-bridge` invocado por un job Bull nocturno. Reutiliza el patrón. |
| Frontend web + **Flutter** | React 18 + Vite (web) + Flutter (apps) | Web para paneles/dashboards; Flutter solo para aprobaciones móviles del día 25 (Ola F). |

---

## 1. Lo que YA EXISTE (no re-construir — solo integrar/pulir)

- **Embedded Signup** (WABA+número) · `metaEmbeddedSignupService.ts`
- **CAPI núcleo**: dedup `event_id` determinístico, hashing **SHA-256/EMQ completo** (em/ph/fn/ln/ct/st/zp/country + ctwa_clid), cola **Bull + retry(5) exponencial + endpoint retry-failed**, eventos **Lead + Purchase(valor+USD)** · `FacebookConversionService/`, `meta-marketing/src/conversions.ts`
- **Captura CTWA** del `referral` en los 3 canales (Cloud/FB/Baileys) → `CampaignMessage` (sourceId, ctwaClid, headline)
- **Kanban funnel** drag&drop con transición de etapas + dedup permanente de conversión · `KanbanServices/`
- **Agente IA Meta Ads** read/plan/execute-con-confirmación (pause/duplicate/create-paused; delete/activate bloqueados) · `MetaAdsAgentChatService`, `MetaAdsToolset`
- **Scoring creativo + generador de copy AIDA (IA)** · `CreativeScoringService`, `AdCopyGeneratorService`
- **Estadística formal (islas)**: **z-test 2-proporciones correcto** (A/B), detección de anomalías z-score/IQR, reglas de fatiga · `ABTestService`, `AnomalyDetectionService`
- **Insights Marketing API on-demand** + cache Redis 1h · `MetaMarketingService`, `MarketingCache`
- **X-Hub-Signature-256** en el webhook de WhatsApp · `MetaWebhookController`

---

## 2. Gap matrix (resumen — detalle por ola abajo)

| Módulo | Estado global | Gap principal |
|---|---|---|
| A Conexión Meta | 🟡 PARCIAL | tokens en texto plano · scopes ads faltan · semáforo no unificado |
| B Señales CAPI | 🟢 mayormente TIENE | falta valor por etapa · Schedule/InitiateCheckout · monitor EMQ · píxel web |
| C Atribución CTWA | 🟡 PARCIAL | cadena anuncio→conjunto→campaña sin normalizar (solo JSON) · sin flag orgánico |
| D Campañas Marketing API | 🟡 PARCIAL | crear CTWA incompleto · sin portafolio creativo · sin import horario/`insights_daily` · versión Graph dispersa |
| E Embudo + ROAS | 🔴 crítico | **ROAS real = mock (`Math.random`)** · CPA/etapa ausente |
| F Calendario + Aprobaciones | 🔴 NO | inexistente (portable desde primitivo UGC) |
| G Motor estadístico | 🔴 ~20% | solo z-test A/B real; falta Bayes/Thompson/Poisson/IC/χ²/regresión/series/EMV |
| NFR | 🟡 PARCIAL | webhook FB sin HMAC · DLQ se borra · audit in-memory · LOPDP consentimiento/supresión |

---

## OLA A — Desbloqueo runtime + seguridad (P0) · **S/M** · *prerequisito de todo*
> Sin esto, lo "TIENE" falla en producción (400s) o es inseguro.
> **✅ OLA A COMPLETA (2026-07-13):** A2.1 (Graph version única) · N6.1 (webhook FB HMAC) · A3.1 (tokens Meta cifrados AES-256-GCM) · A3.2 (expiry real + alerta 7d) · N2.1 (DLQ CAPI — verificado ya presente). Todo con **gate verde (11 E2E)**; N2.1 sin cambios (ya satisfecho).

- [x] **A3.1** ✅ Tokens Meta cifrados en reposo (AES-256-GCM). `helpers/secretCrypto.ts` (key derivada por scrypt de `ENCRYPTION_KEY` — la de 33 chars no sirve como 32 bytes crudos; passthrough retrocompatible + idempotente). Getters/setters en `Whatsapp.tokenMeta` y `CompaniesSettings.facebookSystemUserToken`. **2 excepciones arregladas**: `MetaWebhookController` (findOne-por-token → findAll+compare descifrado) y `TokenManager` (update estático → `encryptSecret` explícito). Migración reversible `scripts/encrypt-meta-tokens.ts` aplicada: **14+6 tokens cifrados (0 en plano)**. Verificado: getter descifra live (webhook `/metaws`→200), reversible 20/20, gate verde. Spec `spec/modules/marketing-secret-encryption-spec.md`. ⚠️ **Depende de `ENCRYPTION_KEY`** — respaldar fuera de banda (perderla = tokens irrecuperables). *(Pendiente mismo trato: `pageAccessToken`, `facebookAppSecret`, API keys IA.)*

- [x] **A2.1** ✅ **`config/metaGraph.ts`** creado (fuente única, v24.0, override `FB_GRAPH_VERSION`) + spec `spec/modules/marketing-meta-graph-version-spec.md`. Reemplazados los defaults **por debajo de v24** en las rutas CAPI (`SendWebsiteEvent` v19, `SendConversionEvent` v20, `SyncDatasets` v18/v20, `TokenManager` v23, `FacebookProvider` v22). Verificado: node boot OK, 0 defaults <v24 en CAPI, config resuelve v24.0. *(pendiente barrido de los ~20 literales v24.0 ya correctos → consistencia)*
- [x] **A3.1** ✅ hecho — ver detalle completo arriba en el bloque de OLA A. **Re-verificado 2026-07-15**: `SELECT` en `Whatsapps` → **14/14** tokens con prefijo `enc:v1:`, 0 en texto plano. *(El detalle de diseño de abajo queda como registro histórico de la investigación previa.)*
  > **DISEÑO PRE-INVESTIGADO (checkpoint 2026-07-13, RETOMAR AQUÍ):**
  > - Helper AES existe en `services/IntegrationServices/BaseIntegrationService.ts:225-245`: `aes-256-cbc`, key `process.env.INTEGRATION_ENCRYPTION_KEY` (default inseguro `'default-key-change-in-production'` → **JC debe setear una key fuerte en `.env` antes**), `scryptSync(key,'salt',32)`, iv `randomBytes(16)`, formato `iv:ciphertext` hex. (También existe `ENCRYPTION_KEY` en 3 sitios — unificar cuál.)
  > - Columnas: `Whatsapp.tokenMeta` (models/Whatsapp.ts:133), `CompaniesSettings.facebookSystemUserToken` (:164).
  > - **Diseño transparente + retrocompatible (cero big-bang)**: helper `encryptSecret(p)` → `"enc:v1:"+payload`; `decryptSecret(s)` → si empieza con `enc:v1:` descifra, **si no, devuelve tal cual (passthrough de texto plano no migrado)**. Getter/setter en el modelo (get descifra, set cifra). Migración encripta los existentes in-place; **reversible** (script inverso `decryptSecret` + backup de la columna).
  > - **RIESGO**: `Model.update` estático (bulk) NO corre setters de instancia → auditar TODOS los write-paths (ej. `metaEmbeddedSignupService.ts:465` usa `whatsapp.update({tokenMeta})` de instancia = OK; buscar los estáticos). Las lecturas están en `CloudAPIService`, `SendConversionEvent`, `MetaMarketingService`, `MetaMessageForwardService.ts:118` (`const {tokenMeta}=whatsapp` → el getter debe correr en acceso a propiedad).
  > - **TEST obligatorio antes de dar por hecho**: (a) un token existente se cifra y `decryptSecret` lo recupera idéntico; (b) `whatsapp.tokenMeta` (getter) devuelve el token en claro para el path de envío WhatsApp Cloud; (c) el envío CAPI (`SendConversionEvent`) sigue construyendo el cliente con el token correcto; (d) `psql` muestra el token ilegible. Usar `qa-agent`, NO `admin@chateam.com`.
- [x] **A3.2** ✅ Columna `tokenMetaExpiresAt` (TIMESTAMPTZ) + `MetaTokenRefreshService` ahora obtiene la **expiración REAL vía `TokenManager.debugToken`** (persiste `expires_at`), decide renovación por expiry real (fallback al proxy `updatedAt` si debug_token falla) y **alerta a 7 días** (`logger.warn ALERTA_EXPIRACION` con días restantes). Verificado: node boot OK, gate verde. *(Follow-up: enrutar la alerta a Telegram/notif además del log.)*
- [x] **N6.1** ✅ **X-Hub-Signature-256** cableado en `FBPageWebhookController.receive` (antes del `sendStatus(200)`), reutilizando `shouldAcceptWebhook` + `req.rawBody` (ya capturado en `app.ts:125`). Modo default `warn` (loguea, acepta); listo para `META_SIGNATURE_MODE=enforce`. Verificado: node boot OK, webhook responde, gate verde.
- [x] **N2.1** ✅ **YA SATISFECHO para el path CAPI** (verificado 2026-07-13, sin cambios de código): (1) **persist-before-send** confirmado en los 4 dispatchers — `SendConversionEvent:435` (crea `pending` antes de `sendEvent:455`), `KanbanLeadConversionService:270`→post:323, `KanbanCustomConversionDispatchService:285`→post:313, `CampaignMessageLeadConversionService:143`. (2) Los eventos persisten en la **tabla `FacebookConversionEvent`** (estado `pending/sent/success/failed`) — **independiente de la retención de jobs Bull** → cero pérdida aunque el job se limpie. (3) Cola CAPI guarda fallidos **7 días** (`FacebookConversionQueue:179 removeOnFail age 7d`). (4) Re-procesable vía `POST /facebook-conversions/retry-failed`. *(Follow-up menor, no-CAPI: revisar retención de jobs `failed` en colas genéricas — bajo impacto, no toca conversiones.)*
- **Aceptación**: `grep` de versión Graph fuera de `config/` = 0 ✅ · tokens ilegibles en `psql` ✅ · webhook FB valida firma ✅ · evento CAPI persiste en BD con estado ✅.

---

## OLA B — Promesa comercial: ROAS real + atribución normalizada (P0) · **L**
> El corazón vendible del spec. Hoy el ROAS es `Math.random`.
> **✅ OLA B COMPLETA (2026-07-13/14):** C2.1 (atribución normalizada) · D5.1 (InsightsDaily + job horario) · E4.1 (ROAS real endpoint) · C3.1 (paid/organic) · B5.1 (valor por etapa + venta manual). **Loop ROAS probado E2E** (venta→revenue→atribución a campaña). Gate verde en cada paso. *Activación numérica del ROAS = automática cuando el job de insights corra con tokens Meta válidos (spend) — infra lista.*

- [x] **C2.1** ✅ Cadena de atribución **normalizada** en `CampaignMessages`: columnas `campaignId`/`adSetId`/`campaignName`/`adName`/`adSetName` (índices `company+campaign`, `company+adset`) — antes solo en `rawData` JSON. Backfill SQL de **1163 filas** (24 campañas distintas). `CreateCampaignMessageService` las persiste going-forward desde la atribución resuelta. Verificado: consultable/agregable por SQL (ROAS-ready), gate verde. *(3438 msgs con ctwaClid; los ~2500 sin cadena resuelta requieren re-resolución vía Graph — opcional, cubierto going-forward.)*
- [x] **D5.1** ✅ Tabla + modelo `InsightsDaily` (upsert por `companyId+date+level+objectId`) **+ job horario** `ImportInsightsDailyService` (itera companies con `facebookSystemUserToken`, `getCampaigns({includeInsights})` → upsert; fail-safe por company/campaña) cableado en `backendCronJobs.ts` (`cron '0 * * * *'`). Verificado: cron registrado en boot ("iniciado (cada hora)"), gate verde. *(Poblará spend con tokens Meta válidos → activa el ROAS numérico de E4.1 automáticamente.)*
- [x] **B5.1 / E3.1** ✅ **Valor por etapa** + **venta manual**: columnas `Tag.metaValue`/`metaCurrency` (valor fijo por etiqueta) inyectadas en el `customData` del dispatch CAPI (`KanbanCustomConversionDispatchService`). **Endpoint `POST /facebook-conversions/register-sale`** (`RegisterSaleService`, SQL crudo por drift del modelo) → crea/actualiza `AttributionConversions.totalRevenue`. **Verificado E2E**: venta manual $250 en ticket → ROAS atribuye `revenue=250, conv=1` a la campaña correcta. Gate verde.
- [x] **D5.1** ✅ **HECHO** (verificado 2026-07-16) — cron horario `handleImportInsightsDaily` + tabla `InsightsDaily` (509 filas reales). *(data-engineer)* — **M**
- [x] **E4.1** ✅ **ROAS + CPA reales** — `services/MetaMarketingService/RoasService.ts` (`getRoasByCampaign`): Σ `AttributionConversions.totalRevenue` (join por ticket → `CampaignMessages.campaignId`) ÷ Σ `InsightsDaily.spend`, con `dataStatus` honesto (`ok`/`no_spend`/`insufficient` — **null en vez de inventar**). Endpoint `GET /meta-marketing/roas`. Verificado con datos reales: company 6 → 12 campañas reales, conversaciones reales (ej. 78), ROAS null por falta de spend (correcto). Reemplaza el mock `Math.random` de `marketingApi.ts` (que no estaba wired al backend). Gate verde. *(CPA por etapa Kanban: sigue — requiere el spend del job D5.1.)*
- [x] **C3.1** ✅ Flag persistido **`Ticket.sourceKind`** (paid|organic) + backfill (**2532 pauta / 4910 orgánico**) + populate on-capture en `CreateCampaignMessageService` (ticket con CTWA → `paid`). Modelo registrado, gate verde. *(Follow-up: segmentar `KanbanMetricsService`/dashboard por `sourceKind` — el flag ya está listo para consumir.)*
- **Aceptación**: dashboard muestra ROAS = ventas/spend real (no aleatorio) por anuncio · CPA por etapa · dos embudos (pauta/orgánico) separados · atribución consultable en SQL.

---

## OLA C — Calidad de señal CAPI (P1) · **M/L**
> Sube el EMQ (criterio de éxito del spec: ≥6/10) y completa el embudo de eventos.

- [~] **B1.1** **Schedule ✅ HECHO 2026-07-15** — nuevo `AppointmentConversionService` cableado en `BookingService` tras crear la cita (async, aislado en try/catch: un fallo de CAPI no tumba la reserva). `event_id` determinista `appointment-{id}-schedule` ⇒ un reintento se deduplica en Meta en vez de contar dos citas. Valor = `AppointmentService.price` (+`currency`) si >0; sin precio se omite `value`. Nueva política `appointment_booked` (default ON, visible en Ajustes) — sin dataset CAPI configurado no se envía nada. **Probado**: política viva en `/facebook-conversions/policies`, cita creada OK con el hook (sin romper la reserva), import resuelto en runtime; el envío real a Meta no es verificable en Demo Company (0 datasets, 0 tickets). **Pendiente**: `InitiateCheckout` — no existe flujo de cotización en el backend; se configura por etapa del Funnel (ver E2.1). *(payment-integration)* — **M**
- [x] **E2.1** ✅ **YA IMPLEMENTADO Y EN USO** (medido 2026-07-15) — `KanbanCustomConversionDispatchService` envía `event_name = tag.metaEventName` por etapa. **Datos reales**: 13 etapas activas con **3 eventos distintos** (`LeadSubmitted`×11, `Purchase`×1, `Lead`×1). Ya NO es "el único Lead opt-in". **Lo único pendiente es CONFIGURAR** `InitiateCheckout` en la etapa de cotización — trabajo de negocio en la UI de Etiquetas, no de desarrollo. ~~Evento estándar distinto por etapa~~ del embudo (nuevo→Lead, cotizado→InitiateCheckout, vendido→Purchase) en vez del único "Lead" opt-in actual. *(backend-developer)* — **M**
- [x] **A4.1 / B6.1** ✅ **HECHO 2026-07-15** — **Monitor de señales**: `MetaSignalMonitorService` + `GET /facebook-conversions/signal-monitor` + pestaña en Facebook Ads (**sin pantalla nueva**, coherente con Fase 3). **Semáforo** (4 checks contra Meta en vivo): token (debug_token → validez, caducidad, nº de permisos) · dataset/pixel (accesible con *ese* token, no solo guardado en BD) · webhook suscrito · calidad del número (quality_rating). **Stats** enviados/aceptados/rechazados por día + por evento + tasa de aceptación (SQL parametrizado). **EMQ real de Meta** vía Dataset Quality API (`GET /v25.0/dataset_quality`) con las claves débiles por evento. **Medido en company 8**: token OK (43 permisos), dataset OK (Pixel meta chateam), número GREEN, 30 eventos 100% aceptados, y **EMQ real: CompleteRegistration 7.7 · Login 6.9 · PageView 6.5 · Visita registro 6.2**. **Límite documentado**: Meta solo puntúa EMQ de eventos `web`; las conversiones `business_messaging` (Kanban/CTWA) **no entran en el EMQ** ⇒ el fix E.164 (B3.1) no es medible por esta vía. Probado en navegador (login real + panel). *(fullstack-developer)* — **L**
- [x] **B3.1** ✅ **HECHO 2026-07-15** — `normalizePhone` en `SendWebsiteEvent.ts` ahora usa `libphonenumber-js` (E.164 real, país por defecto `META_CAPI_DEFAULT_COUNTRY`=EC, fallback al comportamiento previo si no parsea). Los 3 servicios CAPI comparten `buildUserData` ⇒ el fix cubre Kanban, Lead de campañas y website. **Probado**: `0987654321`→`593987654321`, `09 8765 4321`→`593987654321` (antes quedaban sin código de país = invisibles para Meta); E.164 e internacionales intactos. ~~Forzar E.164~~ en el teléfono antes del hash (hoy solo `replace(/\D/g)`) — mejora directa de EMQ. *(backend-developer)* — **S**
- [~] **A1.1** **PARCIAL 2026-07-15** — ✅ **Scopes** `ads_read`+`ads_management` añadidos (autorizados por JC) al `FacebookModal` (FB.login normal ⇒ Meta **sí** honra `scope`) y a la rama **sin `config_id`** del `EmbeddedSignupModal`. ⚠️ **Límite de Meta**: con `config_id` (Facebook Login for Business) **el `scope` se ignora** — los permisos los define la configuración en el panel de la app. ⇒ **Acción manual pendiente de JC**: añadir `ads_read`/`ads_management` a esa configuración en Meta (y valorar App Review para `ads_management` avanzado). ✅ **Vinculación unificada**: el Ad Account ID ya **no se teclea a mano**: `Settings > Facebook Ads` lista las cuentas reales del token vía `/meta-marketing/ad-accounts` (endpoint que **ya existía y el front nunca llamaba**), con fallback al campo manual si no hay token. ✅ **Bug de raíz arreglado**: `MetaMarketingController` aplastaba **14 handlers** a `500` ignorando el `statusCode` del `AppError` ⇒ 'falta configurar Meta' (400) se reportaba como 'servidor roto'. **Verificado**: `/meta-marketing/{ad-accounts,campaigns,test-connection}` 500→**400**; fallback del campo probado en navegador. **Sin verificar**: la rama del selector con cuentas reales (Demo Company no tiene token Meta). **Pendiente**: unificar también página/dataset en el onboarding. *(backend-architect)* — **M**
- **Aceptación**: Events Manager muestra los 4 eventos con EMQ ≥6/10 y dedup correcta · semáforo en verde end-to-end.

---

## OLA D — Motor estadístico formal (P1/P2) · **XL** · *sidecar Python + job nocturno*
> Reemplaza heurísticas/LLM por estadística real (base: Anderson/Sweeney/Williams). Sidecar `stats-bridge` (FastAPI + numpy/scipy/statsmodels), invocado por un job Bull nocturno; resultados en `recommendation_runs`.

- [x] **G0** ✅ **HECHO 2026-07-16 (TS-first)** — tabla `recommendation_runs` (auditoría+acierto) + modelo + registro Sequelize + cron nocturno `stats.nightly` (03:30, por empresa). **Sidecar Python DIFERIDO** por infra (NAS 2.8Gi RAM libre+swap saturado; build scipy pesado arriesga reinicio). Lo cerrado-de-forma corre en Node sin sidecar. *(mlops-engineer)* — **M**
- [x] **G1** ✅ **HECHO+PROBADO 2026-07-16** — scoring bayesiano Beta-Binomial por origen (P(compra) posterior + IC) en `StatsRecommendationService`. Probado E2E company 8: 35 y 141 leads con score/IC reales; company 1 → 'insuficiente' honesto. *(data-scientist)* — **L**
- [x] **G4** ✅ **HECHO+PROBADO 2026-07-16** — IC 95% REAL del CPA (método delta, n=conversiones) en `RoasService` reemplazando el confidence inventado; marca `insufficient` con el n que falta si <30. `StatisticsService.ratioCI` unit-testeado. *(data-scientist)* — **M**
- [~] **G9** PARCIAL — `StatisticsService.controlChart` (cartas ±3σ por rango móvil I-MR, robusto a outliers) IMPLEMENTADO y unit-testeado; falta cablearlo a una serie temporal de métrica. *(anomaly-detector)* — **M**
- [x] **G2** ✅ **HECHO+PROBADO 2026-07-16 (TS)** — `thompsonAllocation` (muestreo Thompson determinista) en StatisticsService + análisis `budget_allocation` en el orquestador. Unit-testeado (variante buena domina). E2E: reporta 'insuficiente' con <2 campañas (correcto). *(data-scientist)* — **L**
- [x] **G3** ✅ **HECHO+PROBADO 2026-07-16** — Poisson λ/hora + P(superar capacidad de agentes). Probado E2E company 8: λ≈3.2/h, 9 agentes, P(exceder)=0.2%, IC [2.88,3.58]. *(quant-analyst)* — **M**
- [~] **G6** PARCIAL — `StatisticsService.chiSquareIndependence` (χ² + Cochran) IMPLEMENTADO y unit-testeado; falta cablear a datos segmento×conversión (hoy 0 conversiones atribuidas). *(data-scientist)* — **M**
- [x] **G7** ✅ **HECHO+PROBADO 2026-07-16 (TS, sin sidecar)** — `linearRegression` OLS (normal equations + inversa Gauss-Jordan) con coeficientes+SE+**p-valores** (t≈normal) + R². Unit-testeado (y=2+3x → β exactos, R²=1; ruido → significancia). Análisis `roas_drivers` (CPA~CTR+frecuencia). E2E: 'insuficiente' con 5 obs (correcto). *(data-scientist)* — **M**
- [x] **G8** ✅ **HECHO+PROBADO 2026-07-16 (TS)** — `forecastExponential` (Holt nivel+tendencia) + escenarios pesimista/base/optimista (±1.28σ). Análisis `spend_forecast`. **E2E company 8: pronóstico real ≈$189.93**. *(quant-analyst)* — **M**
- [~] **G5** PARCIAL — `twoProportionZTest` + `minSampleSize` (α=0.05, potencia 0.8) IMPLEMENTADOS y unit-testeados; falta el trigger de calendario día-15. *(data-scientist)* — **S**
- [~] **G10** PARCIAL — EMV básico presente en el análisis de CPA (escalar/vigilar/insuficiente según IC); falta el reemplazo completo del texto LLM en CampaignRecommendationService. *(data-scientist)* — **L**
- [x] **Flujo 6** ✅ **HECHO+PROBADO 2026-07-16** — Panel `StatsRecommendations` (/stats/recommendations): cada recomendación con MÉTODO+probabilidad/IC+SUPUESTO (explicabilidad NFR), aplicar/descartar con un clic, tasa de acierto. Endpoints run/list/apply/accuracy con override super. Probado E2E: ejecutado desde el panel, ciclo aplicar→hit→100%. *(frontend-developer)* — **M**
- **Aceptación**: ninguna recomendación sin **n mínimo** (muestra "datos insuficientes" con el n faltante) · α=0.05, IC 95% · `recommendation_runs` mide acierto mensual.

---

## OLA E — Gestión de campañas CTWA completa (P2) · **L**
> Cierra el CRUD de anuncios para operar sin salir de chateam.

- [x] **D1.1** ✅ **HECHO+PROBADO 2026-07-16** — `CtwaCampaignService`: campaña OUTCOME_ENGAGEMENT+CBO + adset broad (destination_type=WHATSAPP, optimization CONVERSATIONS, promoted_object.page_id auto-resuelta) + anuncio, SIEMPRE en PAUSED, rollback (por id y por nombre si el id se pierde). Preset USD 10-15, avisa fuera de rango y si la cuenta no es USD. **Probado E2E contra Meta real** (company 8): campaña creada, `destination_type=WHATSAPP` leído DE VUELTA de Meta. Bugs cazados: cliente parseaba `data[0]` en creates→campaña huérfana; `getAd/getAdSet/getCampaign` igual. *(backend-architect)* — **L**
- [x] **D2.1** ✅ **HECHO+PROBADO 2026-07-16** — `CreativePortfolioService`: subida a /adimages (image_hash), listado, **preview por ubicación** (/generatepreviews) y **carrusel** (child_attachments, min 2). **Probado contra Meta**: imagen subida (hash real), preview=iframe firmado, carrusel arma spec+preview y rechaza <2 tarjetas. Copys AIDA: `AIAnalyticsController.generateCopy` (hook/headline/primaryText/cta) estaba **sin ruta montada** (endpoint huérfano, 5 endpoints inalcanzables) → creado `aiAnalyticsRoutes`. Endpoint alcanzable y valida; **bloqueado por OPENAI_API_KEY placeholder ('suakey') en .env** — config de JC, no código. *(fullstack-developer)* — **L**
- [x] **D3.1 / D4.1** ✅ **HECHO+PROBADO 2026-07-16** — **D3.1** `GraduateWinnerService`: ranking de ganadores por CPA (min 15 conv) + clonar a campaña **Escalado** (presupuesto ×2, PAUSED) preservando targeting/promoted_object/creativo (por id). Probado E2E; cazado que el clon perdía `destination_type` (getAdSetsByCampaign no pedía el campo). **D4.1** `LearningPhaseGuardService`: bloquea editar presupuesto/público en aprendizaje (lee `learning_stage_info` de Meta + last_sig_edit_ts para las 72h), 409 con doble confirmación (`confirm:true`), forzado auditado. Probado E2E 4 casos. *(backend-developer)* — **M**
- [x] **E5.1** ✅ **HECHO+PROBADO 2026-07-16** — `CampaignFatigueService`: fatiga real = **CTR↓ Y CPA↑ a la vez** (ambos, con min 1000 imp, ventanas ponderadas por volumen) en vez de la frecuencia (proxy pobre) que usaba `CampaignRecommendationService`. + alerta **fase de aprendizaje atascada** (<50 conv/7d, umbral real de Meta). **Probado E2E**: CTR 2.0→1.25% (-37%) + CPA $2→$5.38 (+169%)→fatiga; 28conv/9d→atasco; **2 alertas creadas** (primeras de esa tabla). *(backend-developer)* — **S**
- [x] **B7.1** ✅ **HECHO+PROBADO 2026-07-16** — `WebPixelService`: snippet `fbq()` con dedup por event_id + validación de instalación (detecta instalado/ausente/id-equivocado). Endpoints `/meta-marketing/pixel/{snippet,validate}`. Probado 3 casos. *(frontend-developer)* — **M**
- **Aceptación**: crear+lanzar una campaña CTWA end-to-end desde chateam · portafolio ≥10 piezas con preview · edición bloqueada en las primeras 72h.

---

## OLA F — Calendario operativo, aprobaciones y cierre (P2/P3) · **L**
> El "moderador Meta" del spec. Portar el primitivo de aprobación de `UGCCreatorAssignment`.

- [x] **F1.1** ✅ **HECHO 2026-07-16** — cron `handleMonthlyCalendar` (diario 08:00, ramifica por getUTCDate()): d20 abre paquete del mes siguiente, d25 recuerda enviados sin aprobar (deadline 48h), d28-30 recuerda programar. *(workflow-orchestrator)* — **M**
- [~] **F2.1** ✅ **BACKEND HECHO+PROBADO 2026-07-16** — modelo `CampaignApproval` + servicio portando el primitivo de UGCCreatorAssignment (submit/approve/reject/requestRevision, feedback obligatorio, plazo 48h, revisionCount) + API `/approvals/*`. **Probado E2E** el ciclo draft→submitted→revisión→approved con userId. ⚠️ **App Flutter del día 25 PENDIENTE**: no compila en este contenedor (limitación conocida); la API que consumiría ya está lista. *(fullstack-developer + flutter-expert)* — **L**
- [x] **F3.1** ✅ **HECHO+PROBADO 2026-07-16** — gating de lanzamiento en `createCtwaCampaign`: si el paquete del mes no está aprobado → **409 ERR_CTWA_NOT_APPROVED** antes de escribir en Meta. Probado: paquete draft bloquea, approved permite. *(backend-developer)* — **S**
- [x] **F4.1** ✅ **HECHO+PROBADO 2026-07-16** — `MonthlyReportService`: informe de cierre (gasto/CPA/ROAS/top creatividades/aprendizajes) desde RoasService (datos REALES, '—' no ceros inventados) → **PDF vía google-chrome headless** (cero deps npm). Endpoints `/reports/monthly-close[.pdf]`. **Probado**: PDF válido 2 páginas 104KB con gasto real $578.98. Cazado bug UTC (título mostraba 'junio' por 2026-07). *(technical-writer + data-analyst)* — **M**
- **Aceptación**: ciclo d15→d30 corre solo · rechazo vuelve con comentario y 48h · no lanza sin aprobación · PDF de cierre generado.

---

## NFR transversal (se cierra a lo largo de las olas)
- [x] **N1** ✅ **HECHO 2026-07-16** — SLO de latencia de señal instrumentado en el dispatcher CTWA: mide cambio-de-etapa→aceptado-por-Meta (`_t0`→`sentAt`), loguea cada latencia y **alerta si >60s** (CampaignAlert). Verificado: backend carga el código, dispatch pasa. *(monitoring-specialist)* — **M**
- [x] **N3** ✅ **HECHO 2026-07-16** — LOPDP: columnas `marketingConsent`/`consentUpdatedAt`/`erasedAt` en Contact + `LopdpService` (consentimiento + **derecho de supresión que PURGA la cola de eventos pendientes/failed** del titular) + **gate en el dispatcher** (contacto suprimido/denegado NO recibe eventos). Endpoints `/lopdp/contacts/:id/{consent,erase}`. Verificado: endpoints responden (404 sin mutar), esquema en BD. ⚠️ E2E de supresión sobre contacto real pendiente (guard bloquea mutar dato real sin OK). SHA-256 ya estaba. *(compliance-auditor)* — **M**
- [x] **N4** ✅ **HECHO (vía hardening Meta 2026-07-15)** — throttling proactivo: Bottleneck (reservoir 100/min) + lectura de la cuota REAL de Meta (`x-business-use-case-usage`/`x-app-usage`/`x-fb-ads-insights-throttle`) con freno al 70% y **corte del grifo al 100%** (reservoir 0) — antes era reactivo tras 429. Colas por tenant: pendiente de arquitectura mayor. *(backend-architect)* — **M**
- [x] **N5** ✅ **HECHO 2026-07-16** — `AuditLogger` ahora **persiste** en tabla `meta_audit_logs` (fire-and-forget, no bloquea ni rompe el request si la BD falla) — antes solo in-memory (MAX 1000, se perdía al reiniciar). El `userId` humano ya está en `AuditLogEntry`. Verificado: tabla+modelo+carga limpia. ⚠️ Trigger E2E pendiente (necesita llamada Meta auditada de company con token). *(security-engineer)* — **M**

---

---

## OLA G — Rediseño Frontend full-responsive (P1) · **XL** · *ref: `crm-chateam-frontend.zip`*
> Prototipo de alta fidelidad (mock, sin backend) que rediseña el CRM. **Stack distinto al actual** de chateam (MUI Joy/Material) → **React 19 + Vite + Tailwind CSS v4 + componentes shadcn (`cva`/`clsx`/`tailwind-merge`) + Phosphor icons + Poppins**, tokens por variables CSS con claro/oscuro, gráficas SVG propias (sin lib).
> **Esto REDIRIGE/SUPERSEDE la Fase B/C previa** (design system en MUI): el design system canónico pasa a ser el del prototipo. Migración **strangler** (coexiste con MUI durante la transición; nada de "big bang").
> **Requisito explícito de JC**: *full responsive a pantalla Y a tamaño de contenido* — layout fluido, no solo breakpoints.

- [x] **G.0 (base)** ✅ Design system adoptado en `frontend/`: **Tailwind v4** (`@tailwindcss/vite`) + **tokens CSS** (teal `#005166`/cyan `#23dada`/coral, claro+oscuro) + **Poppins** self-hosted + `cn()` (clsx+tailwind-merge) + primer componente shadcn `ui/button.tsx` (cva). **Coexiste con MUI SIN preflight** (`tailwind.css` importa solo theme+utilities → no resetea las 90 pantallas). Verificado en vivo: build OK (MUI intacto), CSS con tokens+utilidades, **gate verde (11 E2E, a11y dashboard critical=0)**, desplegado. *(Falta del set `ui/`: input/badge/avatar/checkbox/stat-tile — se portan con las pantallas en G.2.)*
- [x] **G.1** ✅ **Shell responsive** — re-skin de `AppLayout.tsx` (1856→1728L) **preservando TODO**: `menuSections` verbatim (**105 ítems**), `filterItem` gating (roles/`canAccess`/`hasFeature`, recursivo), hooks/estado (collapsed+localStorage, expandedMenus, mobileOpen), 4 useEffect de badges (`/chats-total-unreads` 30s + socket, `/ai/subplan-purchase/token-info` 60s + socket), logout/navigate. **MUI Joy fuera** (solo queda `useColorScheme`); Sheet/List/ListItemButton/Box/Typography/Dropdown/Chip/Tooltip → div/button/a + Tailwind. **Responsive**: sidebar 260px/68px colapsable, **off-canvas móvil** con backdrop, `min-w-0`+scroll propio, **`clamp()`** en padding/fuente, **`@container`** en `<main>`. **a11y**: skip-link, `<nav aria-label>`, `id=main-content`, **`aria-current="page"`** + `aria-expanded`/`aria-pressed`. **BONUS**: añadió el **puente de tema** (`mode`→`.dark` en `<html>`) que faltaba para activar la paleta oscura de Tailwind. **Verificado en vivo**: menú **101 ítems (super) vs 78 (user) → gating OK**; pantallas nuevas (tags 1660, funnel 1904) y **viejas MUI** renderizan; `/contacts` con data = 3108/21 filas/0 errores (sin regresión); móvil 390px off-canvas OK; **gate verde, a11y login 0/0/0**. **Follow-ups ✅ cerrados**: (1) `ui/button.tsx` ahora resetea `appearance-none border-0 [font-family:inherit] cursor-pointer` en la base del cva (la variante `outline` sobreescribe el borde vía tailwind-merge) — necesario por importar Tailwind **sin preflight**. (2) **Contraste — fix sistémico**: los tokens `--success/--warning/--destructive` son de **superficie** y no llegan a 4.5:1 como texto → se añadieron **`--success-text` / `--warning-text` / `--destructive-text`** (oscuros en claro, claros en oscuro) y se aplicaron en `ui/badge`, `ui/avatar`, `ui/stat-tile`, `dashboard/*` y las 9 pantallas (12 archivos); además títulos de sección del sidebar `text-white/35`→`/70` (era 2.43). **Resultado: a11y login 0/0/0 y dashboard 0/0/0 — CERO violaciones.**
- [~] **G.2** Portar las **10 pantallas** con datos reales. **PROGRESO: 8/10** ✅ Login · Tags · QuickReplies · Contacts (lote 1) · Connections · InternalChats · AppointmentsCalendar (lote 2) · **Dashboard** (KPIs + gráficas SVG propias, **a11y 0/0/0**). Vía agentes paralelos + integración/validación. Todas en vivo con datos reales, 0 errores críticos, MUI=0, gate verde. · **Funnel/Kanban** ✅ **re-skin cuidadoso** (NO swap: se conservó `@hello-pangea/dnd` intacto — DragDropContext/Droppable/Draggable + render-props + `handleDragEnd` + `/tag/kanban`,`/ticket/kanban`,`/ticket-tags`; solo se cambió la capa visual, MUI `styled` eliminado). **Verificado en vivo: 10 lanes droppable + 3 cards draggable + 3 drag-handles cableados, 0 errores.** → **9/10**.
· **Tickets/Bandeja — 🟡 FASE 1/3 ✅** (tramo dedicado). La real tiene **4.681 líneas** (141 hooks, 33 api, sockets, 13 subcomponentes propios) vs **61 líneas** del prototipo → **subrepresenta 76×**; un swap borraría la funcionalidad core, por eso va por fases.
  - **Fase 1 ✅ (hecha)**: capa de presentación — `<Box>`(63) y `<Typography>`(59) + sus `sx` → `div/p` + Tailwind. **Box=0, Typography=0, className=117**. **hooks=141 y api=33 IDÉNTICOS** (lógica intacta). Se preservaron a propósito los MUI de **comportamiento** (Select/Option, Modal/ModalDialog, Tabs, Tooltip, Autocomplete) — no son estilo. **Verificado en vivo: bandeja renderiza (4976 chars), 84 items clicables, abrir conversación OK, 0 errores; gate verde, a11y 0/0/0.**
  - **Fase 2 ✅ (hecha)**: `IconButton`(18→0), `Chip`(9→0 → Badge/span), `Avatar`(7→0 MUI, 5 DS con `<img>`+fallback iniciales), `Button`(→10 DS). @mui/joy import limpiado (queda Badge del contador de no-leídos + comportamiento). **hooks=93 y api=33 IDÉNTICOS.** *(Gotcha cazado: el agente quitó Chip/IconButton del import pero dejó 3 usos → habrían crasheado; se le indicó y los convirtió → 0 undefined verificado.)* **Verificado en vivo: bandeja 4934 chars, 63 items clicables, abrir conversación → 55 botones DS funcionando, 0 errores; gate verde, a11y 0/0/0.**
  - **Fase 3 ✅ (hecha)**: componentes de comportamiento → **Radix** (instalado `@radix-ui/react-{select,dialog,tabs,tooltip,dropdown-menu,checkbox}` + 5 wrappers shadcn en `ui/`). `Modal/ModalDialog`(6→0)→`Dialog`, `Menu/MenuItem`(6→0)→`DropdownMenu`, `Select/Option`(→Radix Select), `Tabs`→Radix, `Tooltip`(19)→Radix. Se dejaron en MUI a propósito: `Autocomplete`(2, sin equiv Radix), CircularProgress/LinearProgress. **api=33 idéntico.** **Verificado FUNCIONALMENTE en vivo** (no solo render): 4 tabs Radix + cambio de pestaña OK; abrir conversación → 4 Selects Radix, **al abrir uno se despliegan 16 opciones reales**; 0 errores. Gate verde, a11y 0/0/0. *(Incidente recuperado: un sub-agente fue interrumpido dejando ~400 líneas rotas — Modal/Menu/Option undefined; se diagnosticó por región y un 2º agente enfocado terminó la conversión sin revertir Fase 1+2. **Gotchas: instruir a los agentes "solo tsc, NO vite build" (sobrescriben el dist en vivo sin gz/br); el check de URL horneada del gate debe mirar TODOS los chunks, no solo el entry — el code-splitting la mueve.**)*
  - **Tickets = 100% migrado** (presentación + comportamiento en design system/Radix; MUI residual solo Autocomplete×2 + 2 spinners, aceptable). — rediseñado (BrandPanel + LoginForm shadcn), **cableado al auth real** (`useAuth().login`), responsive; MUI retirado de esa pantalla; ui/ portados: button/input/label/password-input/checkbox. **Desplegado + E2E `login.spec` verde en vivo.** *(Pendientes 9: Dashboard, Tickets/Bandeja, Contactos, Conexiones, Funnel, Agendas, ChatsInternos, MensajesRápidos, Etiquetas — cada una: leer página real → portar UI → cablear datos → build+gate.)*
- [~] **G.3** **Migración progresiva del resto** al nuevo DS; retirar MUI Joy/Material y libs duplicadas al terminar (cierra la deuda de la Fase B: 1 toast, 1 set de iconos). — **XL**
  - **Medición formal (2026-07-14)**: la estimación previa de *"~90 pantallas"* quedó obsoleta. Métrica correcta = `pages/` con **uso real de JSX MUI** (no `import @mui`: una línea importa 10 componentes), excluyendo ya-migradas y huérfanos → **work-list real = 154** (bandas: 99 con <100 usos, 50 con ≥100, resto casi-migradas). Ver protocolo en [GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md](GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md) §3.5.
  - **Progreso: 150/163 migradas y desplegadas** — banda A: piloto (4) + A1 (25) + A2 (25) + A3 (25) + A4 (24) = 103. Banda pesada (≥100 usos): H1–H5 (50) en lotes de 10. Cada oleada: agentes edición-only (1 archivo = 1 agente) → **barrido de fuga de tags** → **UN** `tsc --noEmit` → build a `dist_stage` → gz/br → safe-swap → `ci-gate.sh` → **sonda funcional** de las rutas del lote. Las 15 oleadas cerraron con **tsc 0 errores y GATE VERDE** (RBAC + 11 E2E + a11y 0/0/0 + audit + URL horneada).
  - **Señal de avance real**: `pages/` que importan el DS **8 → 156**. El conteo de `@mui` **no llega a 0 por diseño** (residuales permitidos: `Autocomplete` 13, `CircularProgress` 314, `LinearProgress` 141, `useColorScheme` 2).
  - **Sondas funcionales** (login qa-agent + carga de cada ruta): H3 8/10 · H4 8/10 · H5 7/10. **Todos los fallos son bugs de backend preexistentes**, no regresiones: pantallas montadas con 0 errores JS. Hallazgos registrados → ver "Bugs backend detectados" abajo.
  - **⚠️ CORRECCIÓN DE MÉTRICA (2026-07-15)**: el work-list original (154) se construyó con `pages/*.tsx` **no recursivo** ⇒ **7 pantallas en `pages/Integrations/` nunca entraron al plan** (395 usos MUI). Además **3 agentes reportaron `done` dejando 60-98% sin migrar** (`WhatsAppTemplates` 98 usos, `AISubplans` 86, `IntegrationAriaLite` 64). El total real es **163**, no 154. Ambos fallos se detectaron al verificar el cierre con una métrica **distinta** a la del inventario (`grep` del símbolo objetivo). Lecciones escritas en la guía §8-B3.0 y §8-B3.1.
  - **Oleada de cierre**: 10 pantallas (3 con residual + 7 de subcarpeta) → ✅ hecha, sonda 5/5 limpia, gate VERDE.
  - **✅ CIERRE VERIFICADO (2026-07-15)** — medido por **origen del import**, no por el tag (ver falso positivo abajo):

    | Métrica | Cierre |
    |---|---|
    | JSX MUI de layout restante | **21 en 2 archivos de 170** (arranque: 668) |
    | `pages/` con design system | **166 de 170** (arranque: 8) |
    | `tsc --noEmit` | 0 errores |
    | Gate | 🟢 VERDE |

    **Residual aceptado a propósito**: `Tickets.tsx` (`Stack`×18 + `Sheet`×1) y `Prompts.tsx` (`Chip`×2).
    **Razón de no tocarlo ahora**: convertirlos NO saca MUI Joy del bundle (quedan por diseño 314
    `CircularProgress` + 141 `LinearProgress` + 13 `Autocomplete`), así que es pureza cosmética a cambio
    de riesgo sobre la pantalla más visible, recién validada. Follow-up de bajo valor.

  - **⚠️ Falso positivo del contador (documentar)**: `grep '<Stack'` cuenta también el **icono `Stack` de
    Phosphor** (`<Stack size={28} weight="fill" />`), que no es MUI. El primer conteo daba 29 usos en 7
    archivos; midiendo por **símbolo realmente importado desde `@mui/*`** son **21 en 2**. Regla: contar
    el símbolo por su **origen de import**, nunca por el nombre del tag.
  - **Follow-ups conocidos** (no bloquean el cierre):
    - ✅ **RESUELTO 2026-07-16**: `ui/switch.tsx` creado (24×44, WCAG-compliant). Los **7 archivos** con toggle a 20×36px (`h-5 w-9` — violaban WCAG 2.5.8 Target Size) corregidos a 24×44 (`h-6 w-11` + thumb size-5): CampaignRules, WebChatSettings, IntegrationsSettings, CommentAutoReplyCampaigns, OpenAISettings, AutomationRules, AppointmentsReminders. **Verificado en navegador: switches 44×24, 0 violaciones**; gate verde. *(Consolidar los 31 toggles locales al nuevo `ui/switch` queda como limpieza opcional de menor valor.)*
    - `ui/sheet.tsx` no existe (lo pide el Plan Fase 3, N0.4b).
    - `StatTile` no admite icono ⇒ varias pantallas hicieron `KpiTile` local para no perder los iconos.
    - `Input` aplica `className` al `<input>` interno, no al wrapper ⇒ `flex-1` falla en silencio dentro de un flex row. Footgun documentado.
  - **Bugs backend detectados por las sondas** (preexistentes, fuera del alcance de G.3 — presentación):
    - `/appointments` → **404 por doble prefijo**: el router se monta en `/appointments` ([routes/index.ts:570](../routes/index.ts)) y la ruta declara otra vez `/appointments` ([appointmentRoutes.ts:41](../routes/appointmentRoutes.ts)) ⇒ path real `/api/appointments/appointments`.
    - `/company` → 404 · `/ugc/creators` → 500 · `/meta-marketing/rules` → 500 · `/meta-marketing/ai/copy` → 404+500 · `/meta-marketing/test-connection` → 400.
    - Coinciden con el gap **G4** de [`spec/benchmark.md`](../spec/benchmark.md) (*"13 endpoints 500"*, prioridad P2).
- [x] **G.4** ✅ **HECHO (continuo)** — gate re-verificado tras cada tanda toda la sesión: 11 E2E live + a11y 0/0/0 + npm audit + URL horneada. Verde en cada despliegue de B/C/E/F/G/H. *(qa-expert)* — **M**
- **Aceptación**: las 10 pantallas core en producción con datos reales, **responsive real** (probado a 320px/768px/1440px y con contenedores de distinto ancho vía container queries), Lighthouse ≥90, sin errores axe críticos, MUI en retirada.

---

## OLA H — Moderador de comentarios FB/IG con IA + moderación humana (P1) · **L** · *ref: `moderador-meta.zip`*
> App prototipo **Laravel + Next.js** para ver/responder comentarios de una Página con **respuestas asistidas por Claude** y **moderación humana obligatoria** en casos sensibles (pensado para cuenta política en campaña). **NO se despliega la app Laravel** (stack ajeno) — se **portan sus capacidades** sobre el módulo social que chateam YA tiene (`SocialCommentServices/`, `CommentAutoReplyServices/`, `ModerateCommentService`, RAG + Anthropic SDK).
> Lo que chateam ya tiene: ingesta de comentarios, auto-reply por **keyword**, moderar, responder, log. Lo que **falta** (aporta el moderador):

- [x] **H.1** ✅ **HECHO+PROBADO 2026-07-16** — clasificación de comentarios en categorías sensibles **configurables** (`SensitiveCategory` + campos `moderationStatus`/`sensitiveCategory` en UGCPostComment). Por keywords (determinista, sin depender de IA) con 5 defaults (insultos/legal-electoral/otros-candidatos/denuncias/spam). **Probado E2E**: 'corrupto ladrón'→insultos, 'fraude...CNE'→legal_electoral, spam→spam, neutro→no sensible; categoría custom 'amenazas' pisa defaults. *(nlp-engineer)* — **M**
- [x] **H.2** ✅ **HECHO 2026-07-16** — cola de revisión humana obligatoria: gate en `WebhookCommentProcessor` que **bloquea el auto-reply** (público y privado) si el comentario es sensible → `pending_review`, con **fail-safe: ante error, retener** (mejor no publicar). `CommentModerationService` + endpoints de cola. **Probado**: clasificación+endpoints; ⚠️ ciclo cola→aprobar E2E sobre comentario real PENDIENTE (guard bloqueó mutar dato real sin tu OK). *(backend-architect)* — **M**
- [~] **H.3** PARCIAL — campo `moderationDraft` + edición del borrador en el panel + aprobar/editar con auditoría. ⚠️ **Generación IA del borrador (Claude Sonnet) NO cableada**: necesita proveedor Anthropic válido (hoy en Error). El humano ya puede escribir/editar/aprobar el borrador. *(nlp-engineer)* — **M**
- [~] **H.4** PARCIAL — badge del panel vía `/moderation/queue/count` (nº pendientes) ✅. ⚠️ Notificación Telegram al encargado NO cableada: necesita destinatario configurado. *(backend-developer)* — **S**
- [x] **H.5** ✅ **HECHO 2026-07-16** — `CommentModerationAudit` (inmutable, timestamps=false): registra classified/held/approve/reject/edit_draft con userId, from→toStatus, categoría, draftBefore/After, nota. Endpoint `/moderation/:id/audit`. *(security-engineer)* — **S**
- [x] **H.6** ✅ **HECHO+PROBADO 2026-07-16** — panel `/moderation` (DS): cola con categoría, borrador editable, aprobar/rechazar, filtros por categoría, badge de pendientes, regla visible 'Cero auto-publicación'. **Probado en navegador** (renderiza, estado vacío correcto). *(fullstack-developer)* — **M**
- **Aceptación**: comentario sensible → clasificado → cola humana → borrador IA → aprobación → publicado, con notificación Telegram y registro de auditoría; **cero publicación automática** en categorías sensibles.

---

## Orden de ejecución sugerido
**A (desbloqueo/seguridad) → B (ROAS real) → C (calidad señal) → D (motor stats) ∥ E (campañas) → F (calendario).**
**G (rediseño front)** es transversal y se puede iniciar en paralelo desde ya (empieza por G.0+G.1 design system + responsive shell, luego G.2 pantallas core). **H (moderador)** depende del DS de G para su panel (H.6) pero su backend (H.1–H.5) es independiente y puede ir en paralelo.
A es prerequisito duro (sin versión Graph centralizada, el CAPI falla). B entrega el valor comercial (ROAS real). D y E pueden ir en paralelo tras C. F al final.

## Criterio de éxito global (del spec)
Administrador de Eventos de Meta con eventos de ChaTeam a **EMQ ≥ 6/10** y dedup correcta, y campañas optimizadas por **Purchase** superando en ROAS a las optimizadas solo por conversación iniciada — **medible** desde el dashboard de ROAS real (Ola B) y el monitor de señales (Ola C).

## Trazabilidad
Cada `[ ]` → crear `spec/modules/marketing-*.md` + `spec/acceptance/*.md` antes de codificar. Marcar `[x]` con evidencia (comando/sonda/gate). Reutilizar el gate `scripts/ci-gate.sh` (añadir smokes de CAPI/ROAS).

---

## ⚠️ HALLAZGO TRANSVERSAL (2026-07-15) — "pendiente de desarrollo" vs "pendiente de configuración"

Al medir las olas contra el código (en vez de leer los checkboxes) aparecieron **3 ítems que el plan
daba por pendientes de programar y que en realidad ya están construidos y solo faltan CONFIGURAR**:

| Ítem | El plan decía | Realidad medida |
|---|---|---|
| **E2.1** evento por etapa | "falta, solo hay Lead opt-in" | ✅ funciona: 13 etapas, **3 eventos** distintos en uso (`LeadSubmitted`×11, `Purchase`, `Lead`) |
| **B5.1** valor por etapa | "falta" | ✅ **CONFIGURABLE 2026-07-15**: las columnas eran **huérfanas** (el dispatcher las leía/enviaba, pero ni la UI ni `CreateService`/`UpdateService` podían escribirlas ⇒ imposible cargar valor por la app ⇒ 0/13 etapas). Añadidos a UpdateService + CreateService + `TagController.store` + campos "Valor de la etapa"/"Moneda" en `TagModal`. Validación: vacío/negativo/no numérico = **NULL = sin valor** (nunca 0: un Purchase de $0 falsea el ROAS); moneda `/^[A-Z]{3}$/` en mayúsculas. **Probado por API**: `25.5`+`usd`→`25.50`/`USD`, `""`+`XX1`→NULL/NULL, `-5`→NULL. **Cargar los valores por etapa es ya trabajo de negocio en la UI de Etiquetas.** |
| **E4.1** ROAS real | "ROAS = mock `Math.random`" | ✅ `RoasService` real y cableado; el mock era **código muerto sin importadores** (eliminado) |

**Consecuencia de negocio (la más importante)**: Meta está recibiendo las conversiones **sin valor**
porque ninguna etapa tiene `metaValue`. **El ROAS no puede calcularse por falta de un dato, no por falta
de código.** Cargar el importe por etapa en la UI de Etiquetas es minutos y desbloquea toda la medición.

**Lección de método**: un plan que mezcla "falta código" con "falta configurar" hace priorizar mal —
manda a programar lo que ya existe y esconde el dato que bloquea el resultado. Al auditar, distinguir
**capacidad** (¿el código puede?) de **configuración** (¿alguien lo activó?) y medir ambas.
