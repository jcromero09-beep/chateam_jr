# Fase 2 — Auditoría Técnica (backend + código) · chateam_jr

> Consolidación accionable de los 16 informes de `AUDITORIA_2026_07/`. Cada hallazgo: severidad (P0 crítico / P1 alto / P2 medio / P3 bajo), impacto y corrección propuesta (sin aplicar). Fuente detallada citada por informe.

## Tabla resumen priorizada (P0/P1)

| ID | Sev | Eje | Título | Esfuerzo | Fuente |
|---|---|---|---|---|---|
| S-1 | **P0** | Seguridad | Privesc/ATO: `PUT /users/:id` sin check de rol (check comentado) — **explotable en vivo** | S | 06 |
| S-2 | **P0** | Seguridad | Fuga secretos: `GET /companies` devuelve stripe/paypal/fbAppSecret a `user` — **confirmado en vivo** | S | 06,08,09 |
| S-3 | **P0** | Seguridad | Fuga `facebookAppSecret` real en `GET /settingsFacebook` a cualquier user | S | 08 |
| S-4 | **P0** | Pagos | Webhook Stripe evadible (sin `stripe-signature` → procesa sin validar) → plan gratis / créditos IA infinitos | S | 09 |
| S-5 | **P0** | Pagos | Webhook PayPal sin verificación de firma → plan gratis / comisión afiliado | S | 09 |
| S-6 | **P0** | Seguridad | Backdoor `MASTER_KEY` (login global bypass para cualquier email) | S | 06 |
| S-7 | **P0** | Seguridad | `/internal/*` autoriza por `req.ip==127.0.0.1` sin `trust proxy` (RCE-like wbot) — *mitigado en padeldev por nginx* | S | 01,06 |
| C-1 | **P0** | Correctitud | 13 endpoints en **500** (list/counts/dashboard/campaigns/invoices/…) | M | 08,11 |
| C-2 | **P0** | Correctitud | `whatsapp-rust-bridge` fuera de `package.json` (solo en lock) → `npm install` limpio rompe WhatsApp | S | 04 |
| C-3 | **P0** | Deps | `xlsx@0.18.5` con CVE (prototype-pollution + ReDoS) sin fix | M | 04 |
| C-4 | **P0** | Correctitud | Worker de colas caído (`require()` de jobs bajo ESM/tsx) — **fix en curso** (`await import`) | S | 07,14 |
| P-1 | **P0** | Rendimiento | `/contacts/list` sin paginar (2 MB/1.4 s medido; ~7 MB el tenant mayor → riesgo OOM) | S | 11 |
| O-1 | **P0** | Observabilidad | `/metrics` nunca montado → 0 métricas; sin alerting; worker sin heartbeat | M | 13 |
| M-1 | **P0** | Meta | Graph API **v19.0 EXPIRADA** (HTTP 400) en CAPI conversiones → falla silenciosa | S | 10 |
| T-1 | **P0** | Testing | ~8% cobertura, tests "teatro", CI roto (`jest.integration.config.js` inexistente) | L | 15 |
| P-2 | **P1** | Rendimiento | Pool Sequelize `max:100` == `max_connections:100` PG (nodo+worker = 200) | S | 11 |
| S-8 | **P1** | Seguridad | Webhook Meta firma en modo `warn` (acepta forjados) + `VERIFY_TOKEN=whaticket` | S | 06,10 |
| S-9 | **P1** | Seguridad | Tokens Meta/FB/TikTok en **claro** en BD (`Whatsapps`, `Companies`, `AIProviderConfigs`) | M | 02,06,05 |
| S-10 | **P1** | Pagos | Provisión de créditos IA no idempotente (replay → créditos infinitos); refund/invoices sin ownership | M | 09 |
| A-1 | **P1** | Arquitectura | God-object `wbotMessageListener.ts` (7.501 líneas) hub de ~40 ciclos | L | 14 |
| A-2 | **P1** | Arquitectura | 154 dependencias circulares (49 de lógica reales) | L | 14 |

## Hallazgos por eje

### 1. Seguridad & multi-tenancy (informe 06, 08)
- **S-1 (P0)** Privesc/ATO — `controllers/UserController.ts:323-325` (check de rol comentado), ruta solo `isAuth` (`routes/userRoutes.ts:18`). Un `user` hace `PUT /be/users/<id>` con `{profile:"admin"}` (auto-ascenso) o `{password:"x"}` sobre el admin (ATO intra-tenant). **Fix**: restaurar check de rol; en `UpdateUserService` lista-blanca de campos y prohibir cambio de `profile`/`password` salvo admin/self.
- **S-2/S-3 (P0)** Fugas de secretos — `GET /companies` (`ListCompaniesService` sin `attributes.exclude` ni scope) y `GET /settingsFacebook` devuelven claves de pago/`facebookAppSecret` a cualquier perfil. **Confirmado en vivo** (perfil `user`). **Fix**: `attributes:{exclude:[...secretos]}` + `isSuper`; rotar `facebookAppSecret 8820dee9…`.
- **S-6 (P0)** `MASTER_KEY` — `LoginSessionService.ts:138-145` bypass global. **Fix**: eliminar o break-glass con MFA+auditoría.
- **S-7 (P0)** `/internal/*` — `routes/internal.ts:109-116` sin `trust proxy`. Mitigado hoy en padeldev (nginx no proxea root). **Fix**: `deny` en nginx + `app.set('trust proxy',1)` + secreto interno.
- **S-8 (P1)** Meta webhook `warn` + verify token por defecto — `MetaSignatureValidator.ts:24`, `MetaWebhookController.ts:29`. **Fix**: `META_SIGNATURE_MODE=enforce`, verify token fuerte.
- **S-9 (P1)** Secretos en claro en BD — `models/Whatsapp.ts:120,133,138`, `Companies.stripeSecretKey`, `AIProviderConfigs.apiKey`. **Fix**: AES-256-GCM con `ENCRYPTION_KEY` + migración.
- **P1/P2 varios**: sin rate-limit en login/signup (limiters definidos sin montar), IDOR `mediaUpload`, `POST /companies` sin `isSuper`, bcrypt cost 8, uploads sin `limits`/`fileFilter`, tokens en logs. Ver 06 §4.

### 2. Pagos (informe 09)
- **S-4/S-5 (P0)** Webhooks Stripe/PayPal forjables → escalada de plan gratis y **créditos IA ilimitados** (metadata `tokens` sin validar); PayPal además dispara comisión de afiliado. **Fix**: rechazar si falta secreto; verificar firma PayPal (transmission-id/cert).
- **S-10 (P1)** Idempotencia de provisión de créditos (replay resetea `usedCredits=0`), refund/`PUT /invoices/:id`/`/subscription/cancel` sin ownership. **Fix**: claves idempotentes + verificación de ownership por `companyId`.
- Positivos: monto server-side desde `Plan.amount`, checkout hospedado (PCI SAQ-A), subplan IA con lock de fila.

### 3. Correctitud / bugs (informes 07, 08, 04, 14)
- **C-1 (P0)** 13 endpoints 500 (mismos en los 4 perfiles → bug de código, no RBAC): `/tickets/counts`, `/dashboard/ticketsUsers|ticketsDay`, `/contacts/list-whatsapp`, `/campaigns/list`, `/quick-messages/list`, `/announcements/list`, `/invoices/list`, `/ai/credits/transactions|analytics`, `/ai/agents/metrics`, `/ticketreport/reports`, `/settings/terms/stats`. **Fix**: depurar cada handler (probable include/columna faltante).
- **C-2 (P0)** `whatsapp-rust-bridge` solo en lock + exports sin `require`/`default` (parcheado en runtime). **Fix**: declararla en `package.json` y `patch-package` del `exports`.
- **C-3 (P0)** `xlsx` CVE → migrar a `exceljs` o fijar fork con fix.
- **C-4 (P0)** Worker: `require("./jobs/X")` bajo ESM → migrar a `await import()` (Campaign/GenerationPoll ya migrados; falta `worker.ts:27 await startQueueProcess()` + reinicio).

### 4. Rendimiento (informe 11)
- **P-1 (P0)** `/contacts/list` usa `SimpleListService` sin límite. **Fix**: usar `ListContactsService` paginado.
- **P-2 (P1)** Pool 100==max_connections. **Fix**: `DB_POOL_MAX=25` nodo / `10` worker (ya aplicado en `chateam.config.cjs`), o subir `max_connections`.
- **P1/P2**: crons de negocio en event loop del nodo web (N+1/company/min), dashboard con `console.log` del payload por request, **1918 `console.*`** (281 en hot path WA), sin cache en Dashboard/Statistics pese a Redis, Socket.IO `maxHttpBufferSize 100MB`.

### 5. Arquitectura / deuda (informe 14)
- **A-1 (P1)** god-object `wbotMessageListener.ts` 7.501 líneas; 20 archivos >1.000 líneas; `Tickets.tsx` 4.676.
- **A-2 (P1)** 154 ciclos (105 modelos benignos + 49 lógica). **2.902 `any`** backend sobre `strict:false`.
- **P2/P3**: 3 entrypoints (`server-simple`/`server-distributed`/`server.ts`), envelope inconsistente (75 vs 85), 7 rutas + 2 controladores muertos, 22 `.bak/copy/OLD`, 54 MB de builds muertos (`dist_orig_appro`, `dist_verify_tmp`), compose STALE.

### 6. Observabilidad (informe 13)
- **O-1 (P0)** Arquitectura completa pero desconectada: `/metrics` no montado, Prometheus/Alertmanager no desplegados, worker sin heartbeat (por eso su caída no alertó), Sentry no-op (error handler no hace `captureException`), logs sin traceId. **Fix**: montar `/metrics`, watcher de heartbeat + probe externo con reinicio PM2, health real, `setupExpressErrorHandler`, pino JSON + traceId mixin.

### 7. Meta / Coexistencia (informe 10)
- **M-1 (P0)** 7 versiones Graph API conviviendo; **v19.0 EXPIRADA** (`SendWebsiteEvent.ts:65`) y v20.0 deprecando 2026-09-24. **Fix**: centralizar en **v24.0** (o v25.0) en una sola config `FB_GRAPH_VERSION`. Ver `spec/meta-coexistencia-spec.md`.

### 8. Testing / CI (informe 15)
- **T-1 (P0)** 39 test files (~8% svc, ~99% ctrl sin test), 0 frontend/E2E, tests "teatro" (`api-auth.test.ts` no llama la app), CI roto. **Fix**: reparar CI, cobertura P0 (auth/pagos/RBAC/tenant), E2E Playwright.

### 9. Dependencias (informe 04)
- Deprecadas: `request`, `dialogflow` (dup con `@google-cloud/dialogflow`), `multer@1.x`, `eslint@8`, `aws-sdk v2` (dup v3). MUI **v5+v7** doble `@mui/system`. Libs redundantes: moment+dayjs+date-fns, winston+pino, chart.js+recharts, 2 libs de teléfono.

## Comandos de verificación (a correr, NO ejecutados aquí — pesados)
```
npm run type-check   # strict:false hoy; objetivo strict por etapas
npm run lint         # ~1440 findings reportados
npm test             # requiere BD test; CI roto (jest.integration.config.js falta)
npm audit --omit=dev # xlsx + deps deprecadas
```

## Conteo de hallazgos (consolidado, dedup por causa)
**P0 = 14 únicos · P1 = 41 · P2 = 42 · P3 = 35** (ver `AUDITORIA_2026_07/99-sintesis/RESUMEN.md`). Veredicto técnico: **CRÍTICO** — bloqueadores de confianza (seguridad/pagos) antes de cualquier crecimiento.
