# Auditoría especializada de Seguridad, Privacidad y Multitenant — chateam_jr

> Fase de seguridad del programa Spec-Driven · 2026-07-23 · **MODO NO DESTRUCTIVO / SOLO LECTURA**
> (no se explotó producción, no se extrajeron secretos, no se alteraron datos). Construida SOBRE la
> auditoría técnica (`audit/parts/*.md`), no la repite. Toda afirmación cita evidencia
> `ruta:línea`/símbolo/comando. Separación obligatoria por hallazgo: **[T]** hallazgo técnico ·
> **[R]** recomendación de seguridad · **[J]** asunto jurídico por validar. **No se declara
> cumplimiento legal definitivo.**
>
> Regla de método aplicada: se confrontó el **código de HOY**, no la SPEC. Varios P0 que la SPEC daba
> por vivos **ya están corregidos**; se marca explícitamente para no re-trabajar lo hecho.

Fuentes: `audit/parts/{seguridad,seguridad-appsec,seguridad-privacidad,api-inventario,backend-canales,db-esquema,api-contratos,arquitectura,devops,frontend}.md`.

---

## 1. Inventario de activos

| Activo | Dónde vive | Sensibilidad | Volumen (medido) |
|---|---|---|---|
| PII de contactos (nombre, teléfono, foto) | `Contacts` | Alta (LOPDP) | 11.385 filas |
| Contenido de conversaciones | `Messages` | Alta (LOPDP) | 79.195 filas |
| Traza operativa de tickets | `LogTickets` | Media-Alta | 225.675 filas |
| Media adjunta (imágenes, PDF, comprobantes de pago) | `/public/company{N}/…` | Alta | **4,8 GB** |
| Secretos de pago | `Company.stripeSecretKey/paypalSecretKey` | Crítica | 17 companies |
| Tokens de canal | `Whatsapp.token/tokenMeta/pageAccessToken/tiktok*`, Redis (Baileys) | Crítica | 29 conexiones |
| Claves de proveedores IA | `AIProviderConfig.apiKey/apiSecret` | Crítica | — |
| Saldos/créditos financieros | `AICreditBalances`, `Company.aiTokenBalance` | Crítica (integridad) | — |
| Sesiones/JWT | tabla `Session` + Redis | Alta | 1.971 |
| Credenciales Baileys (signal keys) | Redis, en claro | Crítica | por conexión |

## 2. Actores y fronteras de confianza

```
                          ┌─────────────────────── FRONTERA 1: Internet (NO CONFIABLE) ───────────────┐
  Visitante WebChat ──┐   │  Atacante autenticado (cualquier tenant)   Webhooks entrantes (Meta/…)   │
  (sin login)         │   └───────────────────────────────┬──────────────────────────────────────────┘
                      ▼                                    ▼
             ┌──────────────────────── nginx :443 (FRONTERA 2: TLS, LE 1.2/1.3) ────────────────────┐
             │  location /  → SPA estática      /be/ → :3010      /socket.io/ → :3010 (WS)           │
             └───────────────────────────────────────┬───────────────────────────────────────────────┘
                                                      ▼
        ┌──────────── chateam-node :3010 (FRONTERA 3: aplicación) — server-distributed.ts ───────────┐
        │  authN JWT (fail-closed) · authZ isAuth/isSuper · **aislamiento tenant = por-query companyId**│
        │  Socket.IO (⚠ handshake SIN auth) · Express static /public (⚠ SIN auth)                      │
        └───────┬───────────────────────────┬──────────────────────────────┬────────────────────────┘
                ▼                            ▼                              ▼
   FRONTERA 4 (loopback, confiable)   FRONTERA 4                  FRONTERA 5: terceros (NO CONFIABLE)
   chateam-postgres :5434            chateam-redis :6390          Meta/WhatsApp, Stripe/PayPal/Coingate,
   (requirepass, loopback)          (requirepass, AOF+RDB,        fal.ai/Higgsfield, Google, TikTok,
                                     creds Baileys EN CLARO)       SendGrid/Listmonk
```

**Fronteras débiles (cruces sin control efectivo):**
- **Frontera de tenant** (`companyId`): NO es una frontera de infraestructura; depende de que cada
  query filtre `companyId`. `tenantMiddleware` **montado en 0 rutas** (`arquitectura.md` H-7,
  `seguridad.md`). Roto en Socket.IO (§4 P0-1), en `/public` (§4 P0-2) y en `LogTickets` (§4 P0-3).
- **Frontera 2→3 en `/socket.io/`**: pasa sin autenticar el handshake.
- **Frontera 5 entrante** (webhooks): firma verificada solo en algunos proveedores (§5).

## 3. Diagrama de flujo de datos (DFD) — rutas sensibles

```
[Cliente WhatsApp] →(webhook Meta, HMAC modo warn)→ [node] →(SELECT/INSERT companyId)→ [pg]
                                                        │→(emit io.of(companyId))→ [Socket.IO] →(⚠ sin authN)→ [cualquier navegador]
[Agente/UI] →(JWT Bearer)→ [/be/*] →(isAuth; isSuper en 4,6%)→ [controller] →(service, where companyId)→ [pg]
[Navegador] →(GET /public/companyN/epoch.jpg, ⚠ sin auth)→ [Express static] → [disco 4,8 GB]
[Pasarela pago] →(webhook)→ Stripe/PayPal: firma OK ✓ | Coingate/Telegram: sin firma ✗ → [créditos/planes]
[Baileys] →(creds+signal keys, EN CLARO, sin TTL)→ [Redis] →(AOF+RDB)→ [disco sin cifrar]
```

## 4. Hallazgos P0 (críticos, vivos en el código de hoy)

| ID | Hallazgo | Sev | Prob | Impacto | Evidencia | Conf |
|---|---|---|---|---|---|---|
| **SEC-P0-1** | Socket.IO no autentica el handshake → fuga realtime cross-tenant | Crítica | Alta | Fuga masiva de mensajes/tickets/contactos de cualquier empresa | `libs/socket.ts:125-130` (companyId del namespace, userId de query, 0 `io.use`), emit `CreateMessageService.ts:73`; CORS `origin:"*"` | ALTA |
| **SEC-P0-2** | `/public` servido sin auth ni scope de tenant → fuga de media cross-tenant | Crítica | Alta | Descarga no autenticada de imágenes/PDF/**comprobantes de pago** de otras empresas; URLs adivinables (epoch + companyId entero) | `app.ts:136-155` (`express.static` sin middleware), `config/upload.ts:110`; `mediaRoutes` con `tenantMiddleware` **no montado** | ALTA |
| **SEC-P0-3** | IDOR cross-tenant en historial de tickets (`LogTickets`) | Crítica | Media-Alta | Traza operativa completa de tickets de otra empresa con `ticketId` secuencial | `services/TicketServices/ShowLogTicketService.ts:15-18` (descarta companyId), `routes/ticketRoutes.ts:15` (solo `isAuth`); 225.675 filas, 10 empresas | ALTA |

> **[T]** Los tres comparten causa raíz: la frontera de tenant no está materializada como control,
> solo como convención por-query, y tres superficies (socket, static, un servicio) la omiten.
> **[R]** Middleware de autenticación en el handshake de Socket.IO (verificar JWT y cruzar
> `companyId` del token vs namespace); servir media por una ruta autenticada con scope de tenant
> (no `express.static` directo); `include` de `Ticket` con `where companyId` en `ShowLogTicketService`.

## 5. Hallazgos P1 (altos)

| ID | Hallazgo | Sev | Evidencia | Conf |
|---|---|---|---|---|
| **SEC-P1-1** | IDOR/privesc de créditos IA: `add/deduct/initialize` exigen solo `profile==="admin"` y aceptan `companyId` del body | Alta | `AICreditController.ts:88-176` (`seguridad.md` S-3) | ALTA |
| **SEC-P1-2** | Creds Baileys en Redis en claro, sin TTL, persistidas a disco (AOF+RDB) | Alta | `helpers/useMultiFileAuthState.ts:15-25`, `docker-compose.yml:93-100` (`seguridad-privacidad.md` PR-2) | ALTA |
| **SEC-P1-3** | Uploader principal sin `fileFilter` ni `limits` (23 rutas): DoS de disco + `text/html`/`svg` servidos inline desde `/public` (stored-XSS de origen); carpetas `0777` | Alta | `config/upload.ts` (`seguridad-appsec.md` A-9) | ALTA |
| **SEC-P1-4** | Webhook Coingate forjable (confía en `payload.status` sin re-fetch) → créditos gratis | Alta | `api-contratos.md` C-05, `api-inventario.md` H-14 | ALTA |
| **SEC-P1-5** | HMAC Meta/FB en modo `warn` por defecto → acepta firmas inválidas; `/webhook/facebook` sin `rawBody` → HMAC nunca pasa | Alta | `MetaSignatureValidator.ts:24,129`; `backend-canales.md` C-03/C-04 | ALTA (default) / NV (env prod) |
| **SEC-P1-6** | Secretos de mayor valor en claro en reposo (NFR-006 parcial): `Company.stripeSecretKey/paypalSecretKey/facebookAppSecret`, `AIProviderConfig.apiKey`, `Whatsapp.pageAccessToken/tiktok*` | Alta | `Company.ts:81-93` (`seguridad.md` S-2) | ALTA |
| **SEC-P1-7** | `/internal/*` accesible desde Internet (guard "solo localhost" anulado tras nginx) | Alta | `api-inventario.md` H-01 (ronda previa) | MEDIA (requiere re-confirmar) |
| **SEC-P1-8** | `GET /api/users/:email` expone usuarios cross-tenant incl. `passwordHash` tras token estático global | Alta | `api-inventario.md` H-06; `envTokenAuth` acepta secreto por query (H-15) | MEDIA (ronda previa) |

## 6. Hallazgos P2 / residuales

- **bcrypt cost 8** (< 12, NFR-009) — `models/User.ts:150` [S-1]. · **Telegram** webhook sin
  `secret_token` ni dedupe [C-06]. · **SSRF ciego** en webhook saliente con URL de `req.body`
  (`sendButtonResponseWebhook.ts:60`) [A-7]. · **Path traversal** de escritura en filename de upload
  [A-8]. · `/companies/find|:id|list` devuelven secret keys de la **propia** empresa a rol `user`
  [S-4]. · **Apple IAP** sin verificar recibo (`decodeAppleJWT` "sin verificar") [S-5]. · **Open
  redirect** `/tracking/click` [H-08] y **unsubscribe por GET** con id secuencial [H-09]. · OAuth
  callbacks **sin `state` firmado** [H-10, C-08]. · `REDIS_SECRET_KEY` con default hardcodeado
  `"MULTI100"` [S-8]. · Rate-limit con **memory store** → conteo por-instancia en multinodo. · Sin
  soft-delete y sin retención/particionado (185 tablas, `LogTickets` sin TTL) [db-esquema].

## 7. Controles ya presentes (no reconstruir)

| Control | Estado | Evidencia |
|---|---|---|
| Ciclo de sesión (rotación de refresh, detección de reuso, revocación server-side, `tokenVersion`) | **EXISTE, robusto** | `seguridad-appsec.md`; `seguridad.md` |
| JWT fail-closed, ≥32 chars, sin fallback | EXISTE | `seguridad.md` |
| Webhooks Stripe/PayPal firmados fail-closed | **EXISTE (P0 SPEC corregido)** | `SubscriptionController.ts:719-782`, `app.ts:93-128` |
| `GET /companies` / `/settingsFacebook` ya no filtran secretos cross-tenant | **EXISTE (P0 SPEC corregido)** | `CompanyController.ts:75`, `SettingController.ts:56-69` |
| Endpoints financieros IA tras `isSuper`; rate-limit auth montado (5/15min, 3/h) | **EXISTE (P0 SPEC corregido)** | `financialRoutes`, `authRoutes.ts:13-23` |
| Webhook fal.ai (Ed25519 + anti-replay), Integration (per-connection) | EXISTE | `api-contratos.md` C-05 |
| XSS mitigado (DOMPurify, iframe `sandbox`); SQLi parametrizado (bind/replacements); sin CSRF (Bearer); CORS Express correcto | EXISTE | `seguridad-appsec.md` |
| TLS de borde (1.2/1.3, LE); pg/redis loopback + `requirepass` | EXISTE | `seguridad-privacidad.md` |
| `xlsx` parcheado a 0.20.3 (CVE C-3 remediado); `META_DEBUG_HTTP` OFF por defecto | **EXISTE (deuda SPEC corregida)** | `seguridad-privacidad.md` |
| Módulo LOPDP (`routes/lopdpRoutes.ts`, `LopdpService`) — supresión lógica + T&C + unsubscribe | PARCIAL | `seguridad-privacidad.md` |

## 8. Matriz de controles

| Control | Estado | Clasificación |
|---|---|---|
| AutenticaciónN (JWT) | Robusto, fail-closed | EXISTE |
| AutorizaciónZ RBAC fino (permisos) | Modelo `Role` **nunca evaluado en backend** (solo front); 4,6% rutas con `isSuper` | PARCIAL |
| Aislamiento por tenant | Por-query; **0 middleware**; roto en socket/static/LogTickets | PARCIAL |
| Cifrado en tránsito | TLS borde OK; interno loopback | EXISTE |
| Cifrado en reposo | AES-256-GCM solo 2 columnas; secretos de pago/IA en claro | PARCIAL |
| Firma de webhooks | Stripe/PayPal/fal.ai OK; Meta/FB `warn`; Coingate/Telegram/MercadoPago ✗ | PARCIAL |
| Rate limiting | Auth montado; memory store multinodo | PARCIAL |
| Validación de entrada | SQLi/XSS mitigados | EXISTE |
| Validación de uploads | Sin fileFilter/limits en el uploader principal | AUSENTE |
| Logging seguro | `META_DEBUG_HTTP` OFF; revisar PII en logs de canal | PARCIAL |
| Retención / borrado / exportación | Olvido lógico; sin retención; sin exportación/portabilidad | AUSENTE |
| Backup / restauración | Scripts obsoletos; sin backup funcional cifrado | AUSENTE |
| Consentimiento | T&C + unsubscribe email; solo CAPI; sin cookie consent | PARCIAL |
| Almacenamiento móvil | Sin app móvil | N/A |

## 9. Matriz multitenant (aislamiento por `companyId`)

| Dominio de datos | ¿Aislamiento efectivo? | Mecanismo / brecha |
|---|---|---|
| Tickets, Messages, Contacts (núcleo) | **Sí** | `where companyId` desde JWT validado contra `Session` |
| `LogTickets` (historial) | **NO** | Servicio ignora companyId (SEC-P0-3) |
| Media `/public` | **NO** | `express.static` sin auth (SEC-P0-2) |
| Socket.IO (tiempo real) | **NO** | Handshake sin auth, namespace enumerable (SEC-P0-1) |
| Créditos IA | **NO** (integridad) | `companyId` del body sin validar (SEC-P1-1) |
| Secretos de company (`GET /companies`) | **Sí (corregido)** | Exclusión de atributos + scope |
| `/api/users/:email` | **NO** (dudoso) | Token estático global (SEC-P1-8, ronda previa) |
| Secretos propios a rol `user` | Parcial | `/companies/:id` devuelve secret keys propias (S-4) |
| Webhooks de email | **NO** | Resolución de destinatario sin `companyId` (C-12) |

## 10. Asuntos jurídicos por validar [J] — requieren asesoría legal externa

> **No se declara cumplimiento ni incumplimiento legal.** Se listan para revisión jurídica.

1. Aplicabilidad de **LOPDP (Ecuador)** y, si hay clientes UE, **RGPD**, al tratamiento de
   `Contacts`/`Messages`.
2. **Derecho al olvido**: hoy es supresión lógica (`erasedAt`), no borra `Messages`/`Contacts`/media
   — ¿suficiente jurídicamente?
3. **Política de retención** de datos personales (no existe; `Messages`/`LogTickets` sin TTL).
4. **Exportación / portabilidad** de datos por titular (no existe endpoint).
5. **Consentimiento** para campañas WhatsApp/email masivas (hoy solo se aplica en pipeline Meta CAPI).
6. **Cookie consent** (ausente) según normativa aplicable.
7. **Transferencia internacional** de datos a procesadores US (Meta, Stripe, fal.ai, Google).
8. **Datos de pago**: alcance PCI-DSS al delegar en Stripe/PayPal (¿SAQ-A?) y comprobantes en
   `/public` (SEC-P0-2).
9. **Notificación de brechas**: procedimiento y plazos exigibles.

## 11. Cierre — P0, P1, riesgo residual y acciones inmediatas

### P0 (bloqueantes de operación segura — 3)
1. **SEC-P0-1** Socket.IO sin auth → fuga realtime cross-tenant.
2. **SEC-P0-2** `/public` media sin auth → fuga de archivos cross-tenant (incl. comprobantes).
3. **SEC-P0-3** IDOR `LogTickets`.

### P1 (altos — 8): SEC-P1-1..8 (créditos IA IDOR, creds Baileys en Redis, uploads sin límite,
Coingate forjable, HMAC Meta `warn`/FB roto, secretos de pago en claro, `/internal` expuesto,
`/api/users/:email`).

### Riesgo residual (aceptar/monitorizar tras P0-P1)
- RBAC fino nunca evaluado en backend (modelo `Role` decorativo) → cualquier `isAuth` alcanza las
  ~792 rutas no-super; el control real es tenant por-query.
- Rate-limit por-instancia en multinodo. · bcrypt 8. · Sin retención/soft-delete. · OAuth sin
  `state`. · Sin backup funcional cifrado (continuidad).
- **NO VERIFICABLE** (sin autorización de ejecución / `.env` bloqueado): valores prod de
  `META_SIGNATURE_MODE`, `STRIPE_WEBHOOK_SECRET`, `ENCRYPTION_KEY`; estado real de migración de
  secretos a `enc:v1:`; vulnerabilidades transitivas (requiere `npm audit`); cobertura exhaustiva de
  filtrado `companyId` en ~120 servicios (solo muestreo); re-confirmación de H-01/H-06 (ronda previa).

### Acciones inmediatas recomendadas [R] (mitigación, NO plan de implementación)
1. Autenticar el handshake de Socket.IO y acotar `origin` (cierra SEC-P0-1).
2. Sacar `/public` de `express.static` directo → ruta autenticada con scope de tenant (SEC-P0-2).
3. Parche de `include`+`where companyId` en `ShowLogTicketService` (SEC-P0-3).
4. Validar `companyId` propio en `AICreditController` y exigir `isSuper` para crédito (SEC-P1-1).
5. Confirmar en `.env` prod que Meta/FB están en `enforce` y que Coingate re-consulta estado.

> **Detención de fase:** este documento es auditoría de seguridad + recomendaciones puntuales de
> mitigación. **No** contiene plan detallado de implementación ni priorización en olas (queda para la
> Fase Plan, sujeta a aprobación).
