# PLAN PRELIMINAR de remediación — chateam_jr

> Fase Plan del programa Spec-Driven · 2026-07-24 · **PRELIMINAR, NO IMPLEMENTAR, NO MODIFICAR
> CÓDIGO.** Convierte exclusivamente los **gaps confirmados** por `audit/` (auditoría técnica +
> `audit/SEGURIDAD_MODELO_AMENAZAS.md`) en tareas normalizadas y priorizadas. Nada aquí se ejecuta
> sin abrir spec + acceptance por tarea y sin aprobación humana (AGENTS.md Reglas 2, 6, 8).
>
> Ubicación: `docs/_consolidado/plan/` (mapea `plan/` del encargo). Fuente de gaps:
> `audit/00_RESUMEN_EJECUTIVO.md`, `audit/MATRIZ_SPEC_VS_REALIDAD.md`,
> `audit/SEGURIDAD_MODELO_AMENAZAS.md`, `audit/parts/*.md`.

---

## 0. Normalización (antes de planificar)

### 0.1 Falsos positivos / OBSOLETO — EXCLUIDOS del plan (ya resueltos; no generar tarea)
Confrontado contra el código de hoy (`audit/`), **no** se planifican:
- Worker "stopped" → **ONLINE** 11d. · Bundle "monolítico 2.75MB" → **code-split**. · FlowBuilder
  "11 modales vacías" → **implementadas**. · `xlsx@0.18.5` CVE → **0.20.3**. · Webhooks Stripe/PayPal
  "sin firma" → **firmados fail-closed**. · `GET /companies`/`/settingsFacebook` "filtran secretos" →
  **corregido**. · Financiero IA "sin isSuper" → **isSuper aplicado**. · Rate-limit "sin montar" →
  **montado**. · `wbotMessageListener` "7.501 líneas" → **6.764**.

### 0.2 Causas raíz (fusionan varios hallazgos en un tema)
- **RC-1 · Frontera de tenant no materializada como control** (solo por-query, `tenantMiddleware`=0):
  origina SEC-P0-1 (socket), SEC-P0-2 (/public), SEC-P0-3 (LogTickets), C-12 (email sin scope) **y
  (INV-05) una clase de mutaciones destructivas cross-tenant** `Delete*/Update*` con `where:{id}` sin
  `companyId` (W1-SEC-12: DELETE /tickets, invoices, etc.). No es solo fuga de lectura: también borrado
  y edición cross-tenant.
- **RC-2 · Disciplina de migración rota**: 23 modelos ≠ tabla, 46 tablas sin migración, `WebhookModel`
  muerto, modelos no registrados llamados desde rutas montadas.
- **RC-3 · Contratos sin gobierno**: envelope triple, sin `/v1`, sin keys con scope, RBAC fino
  decorativo (modelo `Role` nunca evaluado en backend).
- **RC-4 · Observabilidad/continuidad ausente**: `/metrics` 404, sin backup funcional, CI roto.
- **RC-5 · Maquetas mezcladas con producción**: zonas MOCK (Leads, AppointmentsReports, Integraciones)
  y páginas huérfanas conviviendo con módulos reales.

### 0.3 Duplicados fusionados
- Secretos de canal en claro (C-09) + secretos de pago/IA en claro (S-2) → **W1-SEC-06** (uno).
- LogTickets: parche inmediato (SEC-P0-3) y columna estructural (DB-01) → **W1-SEC-03** + **W2-DATA-01**.
- `WebhookModel` muerto aparece en DB-02 y en funcionalidad FlowBuilder → **W2-DATA-02** (uno).

### 0.4 NO VERIFICABLE → tareas INV (no implementación)
Todo lo que la auditoría no pudo confirmar sin ejecutar/leer `.env` se planifica como **investigación
previa** (Ola 0), no como fix. Ver W0-INV-01..10.

> **Actualización 2026-07-24 — Ola 0 INV parcialmente EJECUTADA** (`audit/inv/W0-INV-0{1,2,8,9}.md`):
> - **INV-02:** H-01 **CONFIRMADO EN VIVO** (`GET /be/internal/health` externo → 200 con JSON interno)
>   → `W5-API-04` **P1→P0**. H-06 confirmado estático (guard presente en vivo; fuga no verificada sin
>   extraer el `COMPANY_TOKEN`) → nueva **W1-SEC-11 P0**.
> - **INV-01:** de 13 endpoints "siempre-500", **11 ya dan 200**; solo 2 siguen (`/ticketreport/reports`,
>   `/announcements/list`) → **W4-FUNC-01 reducida P1→P2, 13→2**.
> - **INV-08:** cobertura **NO OBTENIBLE** — el runner crashea en `meta-official-mcp.test.ts`
>   (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG`); 9 suites unit pasan. Concreta el blocker de
>   **W6-INFRA-02**. Cobertura sigue NO VERIFICABLE.
> - **INV-09 (carga):** DIFERIDO por riesgo a producción viva (21 sesiones reales, NAS saturado). NFR-011
>   NO VERIFICABLE hasta entorno aislado.
> - **INV-03 (`.env`, autorizado):** `COMPANY_TOKEN` UNSET → **H-06 P0→P2 latente** (endpoint cerrado);
>   `META_SIGNATURE_MODE` no declarada → `warn` (SEC-P1-5 vivo); `COINGATE_API_TOKEN` UNSET → SEC-P1-4→P3;
>   PayPal sin configurar; `ENCRYPTION_KEY` presente (W1-SEC-06 desbloqueada). **P0 activos: 4.**
> - **INV-04 (`npm audit`):** 0 críticas, **21 high** (axios SSRF, engine.io DoS del transporte socket,
>   baileys→link-preview-js, lodash, nodemailer). Pasan el gate actual (solo bloquea críticas). → sub-tarea
>   en W8-DEBT + endurecer gate (W6-INFRA-02).
> - **INV-07 (madge):** **162 ciclos** = 114 models (benignos) + **48 lógica** (42 vía
>   `wbotMessageListener`). W8-DEBT-04 medido; refuerza W8-DEBT-03 (god-object).
> - **INV-05 (barrido companyId):** causa raíz sistémica — `Delete*/Update*Service` con `where:{id}` sin
>   `companyId`. **Nuevo P0: `DELETE /tickets/:ticketId`** (guard comentado, destructivo cross-tenant con
>   cascade, verificado). 8 candidatos AUSENTE (invoices list/update P1 financiero, 5 DELETE P1/P2). →
>   nueva **W1-SEC-12**. **P0 activos: 5.** Residual: ~818 servicios sin revisar (muestreo dirigido).
> - Pendientes: INV-06 (axe, requiere build front), INV-10 (EXPLAIN), INV-09 (carga, diferido).

### 0.5 Deuda aceptada (registrada, NO se remedia en este ciclo)
Ver §5. Incluye: consolidación de 3 design systems, split del god-object, i18n (pendiente de decisión
de negocio BR-013), y enforcement de RBAC fino en backend (interino: tenant por-query si los P0 caen).

---

## 1. Convenciones del plan

**Prioridad:** P0 seguridad/datos/auth · P1 continuidad y funciones principales · P2
contratos/rendimiento/UX · P3 limpieza.
**Talla:** S (≤0.5d) · M (≤2d) · L (≤1sem) · XL (>1sem/multi-fase).
**REVERSIBLE:** gate + swap; rollback = swap inverso. **SENSIBLE:** toca datos/seguridad/auth/dinero →
exige **backup + compatibilidad + script inverso + idempotencia + verificación aguas abajo** (Regla 9).

**Invariantes globales** (toda tarea las preserva; no se repiten por tarea):
- I-G1: cero regresión de aislamiento cross-tenant (ninguna respuesta cruza `companyId`).
- I-G2: `scripts/ci-gate.sh` en verde tras la tarea (RBAC smoke + E2E + audit + URL horneada).
- I-G3: no romper el ciclo de sesión ni los webhooks ya firmados (controles buenos existentes).
- I-G4: `.env` read-only para agentes; secretos nunca al log ni al repo.

**Agentes** (del catálogo disponible): `security-engineer`, `backend-architect`, `backend-developer`,
`database-architect`/`postgres-pro`, `websocket-engineer`, `api-designer`, `payment-integration`,
`performance-engineer`, `devops-engineer`, `frontend-developer`, `qa-expert`, `penetration-tester`
(solo para INV de re-confirmación autorizada).

**Regla de gate por ola:** ninguna ola avanza sin (a) spec+acceptance por tarea, (b) gate verde, (c)
evidencia, (d) bloque de progreso (AGENTS.md Regla 10).

---

## 2. Mapa de olas

| Ola | Tema | Tareas | Bloquea a |
|---|---|---|---|
| **W0** | Preparación / gates / INV | W0-INV-01..10, W0-GATE-01..02 | Todas (backup+baseline son prerequisito de lo SENSIBLE) |
| **W1** | Seguridad (P0/P1) | W1-SEC-01..10 | W2, W3 |
| **W2** | Datos | W2-DATA-01..07 | — |
| **W3** | Auth / RBAC / multitenancy | W3-AUTH-01..03 | — |
| **W4** | Funcionalidad | W4-FUNC-01..05 | — |
| **W5** | APIs / integraciones | W5-API-01..04 | — |
| **W6** | Rendimiento / infra | W6-PERF-01..03, W6-INFRA-01..03 | — |
| **W7** | Frontend (Flutter N/A) | W7-FE-01..03 | — |
| **W8** | Deuda | W8-DEBT-01..04 | — |

Orden de ejecución sugerido: **W0 → W1 → (W2 ∥ W3) → W4 → W5 → W6 → W7 → W8**. W1 primero por Regla 5
(seguridad). W0 abre backup+baseline sin los cuales ninguna tarea SENSIBLE puede correr.

---

## 3. Tareas

> Formato por tarea (16 campos). Campos no repetidos usan los invariantes globales §1.

### OLA 0 — Preparación, gates e investigación (INV)

**W0-GATE-01 · Backup cifrado funcional + ensayo de restauración**
- Origen: `devops.md` (scripts backup obsoletos), `seguridad-privacidad.md` PR-6. · Evidencia:
  `scripts/backup.sh` apunta a infra Docker-Compose inexistente; sin backup del stack vivo.
- Objetivo: un backup cifrado reproducible de `chateam-postgres` (:5434) + Redis + `public/`, con
  ensayo de restore verificado. · Gap: no existe backup funcional del stack real.
- Prioridad P0 (habilitador) · Talla M · **SENSIBLE** · Agente: `devops-engineer`.
- Dependencias: ninguna. · Invariantes: no interrumpir servicios (backup en caliente).
- Spec requerido: `spec/modules/backup-restore-spec.md`. · Acceptance: restore en entorno aislado
  reproduce datos íntegros. · Pruebas: `pg_restore` a DB temporal + checksum de filas.
- Rollback: n/a (no muta prod). · Criterios binarios: (1) dump cifrado generado; (2) restore probado
  ≥1 vez; (3) documentado RPO/RTO.

**W0-GATE-02 · Línea base verde del gate + harness de sonda a staging**
- Origen: `qa.md` (CI roto), `scripts/ci-gate.sh`. · Evidencia: job `test` corre `db:migrate` sin
  build; `load-test.js` inexistente.
- Objetivo: `ci-gate.sh` ejecutable en verde como baseline y una sonda autenticada reproducible
  (79+ endpoints × 4 perfiles) para medir antes/después. · Gap: no hay baseline ejecutable confiable.
- Prioridad P0 (habilitador) · Talla M · REVERSIBLE · Agente: `qa-expert`.
- Dependencias: requiere **autorización explícita** para ejecutar (build/tests) — hoy prohibida.
- Spec: `spec/testing-spec.md` (actualizar). · Acceptance: gate corre y reporta verde/rojo real.
- Pruebas: la propia ejecución del gate. · Rollback: n/a. · Criterios: (1) gate corre sin error de
  tooling; (2) sonda captura status+body por perfil.

**W0-INV-01..10 · Investigaciones (convierten NO VERIFICABLE en dato)** — todas P-según-riesgo, Talla
S/M, REVERSIBLE (solo miden), Agente `qa-expert`/`security-engineer`/`penetration-tester`(autorizado):
| INV | Qué confirmar | Origen | Criterio binario |
|---|---|---|---|
| W0-INV-01 | Re-sondar los 13/79 endpoints en 500 (autenticado) | `MATRIZ` NFR-003 | lista real de endpoints aún en 500 |
| W0-INV-02 | Re-confirmar H-01 `/internal` expuesto y H-06 `/api/users/:email` en código actual | `api-inventario` | vivo / corregido, con ruta:línea |
| W0-INV-03 | Auditar `.env` prod (META_SIGNATURE_MODE, STRIPE_WEBHOOK_SECRET, ENCRYPTION_KEY, migración `enc:v1:`) — **requiere autorización de lectura** | `seguridad`, `api-contratos` | valores/estado confirmados |
| W0-INV-04 | `npm audit` de vulnerabilidades transitivas (`whatsapp-rust-bridge`, `baileys@rc13`) | `seguridad-privacidad` | CVEs con severidad |
| W0-INV-05 | Barrido exhaustivo de filtrado `companyId` en ~120 servicios | `seguridad` | servicios sin filtro listados |
| W0-INV-06 | Ejecutar axe/a11y en flujos core (NFR-017) | `frontend` | violaciones reales por pantalla |
| W0-INV-07 | `madge` — 154 ciclos declarados | `arquitectura` | grafo real de ciclos |
| W0-INV-08 | Cobertura real de tests + arreglar CI para que corra | `qa` | % cobertura medido |
| W0-INV-09 | Prueba de carga límite sesiones Baileys/nodo (NFR-011) — **requiere autorización** | `MATRIZ` | límite real por nodo |
| W0-INV-10 | `EXPLAIN ANALYZE` de queries lentas + impacto de índices (NFR-001/002) | `rendimiento` | plan de ejecución real |

> Los INV no modifican código; producen `audit/inv/<id>.md`. Su resultado puede **reclasificar** o
> **cerrar** tareas de olas posteriores.

### OLA 1 — Seguridad

**W1-SEC-01 · Autenticar el handshake de Socket.IO (P0-1)**
- Origen: SEC-P0-1 (`seguridad-appsec.md` A-2). · Evidencia: `libs/socket.ts:125-130` (companyId del
  namespace, userId de query, 0 `io.use`); emit `CreateMessageService.ts:73`; CORS socket `origin:"*"`.
- Objetivo: verificar JWT en el handshake y cruzar `companyId` del token vs namespace; acotar `origin`.
  · Gap: 0 middleware de auth en el transporte de tiempo real.
- Prioridad **P0** · Talla M · **SENSIBLE** (transporte vivo) · Agente: `websocket-engineer`.
- Dependencias: W0-GATE-01/02. · Invariantes: no cortar sockets legítimos existentes; I-G1.
- Spec: `spec/modules/realtime-socket-auth-spec.md`. · Acceptance: sin JWT válido → conexión rechazada;
  namespace ≠ companyId del token → rechazada. · Pruebas: sonda WS con token ajeno/ausente + regresión
  de recepción legítima. · Rollback: revertir middleware (swap). · Criterios: (1) WS sin token = 401;
  (2) WS a companyId ajeno = rechazado; (3) agente legítimo sigue recibiendo mensajes.

**W1-SEC-02 · Servir `/public` tras auth + scope de tenant (P0-2)**
- Origen: SEC-P0-2 (`seguridad-privacidad.md` PR-5). · Evidencia: `app.ts:136-155` `express.static` sin
  middleware; nombres epoch (`config/upload.ts:110`); `mediaRoutes` con `tenantMiddleware` no montado.
- Objetivo: media servida por ruta autenticada con verificación de `companyId` propietario; URLs no
  adivinables. · Gap: descarga cross-tenant no autenticada (incl. comprobantes de pago).
- Prioridad **P0** · Talla L · **SENSIBLE** · Agente: `backend-architect`.
- Dependencias: W0-GATE-01. · Invariantes: no romper media legítima ya referenciada; I-G1.
- Spec: `spec/modules/media-access-spec.md`. · Acceptance: GET de media de otra empresa (o sin sesión)
  → 403/404; propietario → 200. · Pruebas: sonda de acceso cross-tenant a media. · Rollback: restaurar
  `express.static` (swap) — solo si no rompe compat. · Criterios: (1) media ajena = denegada; (2)
  propia = servida; (3) enlaces existentes migran sin 404 masivo.

**W1-SEC-03 · Parche IDOR `LogTickets` (P0-3, inmediato)**
- Origen: SEC-P0-3 (`db-esquema.md` DB-01). · Evidencia: `ShowLogTicketService.ts:15-18` descarta
  `companyId`; `ticketRoutes.ts:15` solo `isAuth`.
- Objetivo: `include: [{ model: Ticket, required: true, where: { companyId }, attributes: [] }]`. · Gap:
  el servicio ignora el tenant.
- Prioridad **P0** · Talla S · **REVERSIBLE** · Agente: `backend-developer`.
- Dependencias: ninguna (parche mínimo). · Invariantes: I-G1.
- Spec: nota en `spec/modules/tickets-spec.md`. · Acceptance: log de ticket de otra empresa → vacío/403.
  · Pruebas: sonda con `ticketId` de otro tenant. · Rollback: revertir el `include`. · Criterios: (1)
  ticket ajeno = sin filas; (2) propio = intacto.

**W1-SEC-04 · IDOR/privesc de créditos IA (P1-1)**
- Origen: `seguridad.md` S-3. · Evidencia: `AICreditController.ts:88-176` (`profile==="admin"`,
  `companyId` del body).
- Objetivo: exigir `isSuper` para crédito y validar `companyId==req.user.companyId`. · Gap: un admin
  auto-provisiona créditos de pago o escribe en otra empresa.
- Prioridad **P1** (integridad financiera) · Talla S · **SENSIBLE** (dinero) · Agente: `security-engineer`.
- Dependencias: ninguna. · Invariantes: I-G1; no alterar saldos existentes.
- Spec: `spec/modules/creditos-costos-ia-spec.md` (ampliar). · Acceptance: admin no-super no puede
  add/deduct; companyId del body ignorado. · Pruebas: sonda admin→otra empresa. · Rollback: revertir
  guard. · Criterios: (1) add/deduct sin super = 403; (2) companyId ajeno = 403.

**W1-SEC-05 · Uploads: `fileFilter` + `limits` (P1-3)**
- Origen: `seguridad-appsec.md` A-9. · Evidencia: `config/upload.ts` sin filtro/límite (23 rutas);
  `text/html`/`svg` inline; carpetas `0777`.
- Objetivo: allowlist de MIME seguro, límite de tamaño, `Content-Disposition: attachment` para tipos
  activos, permisos de carpeta correctos. · Gap: DoS de disco + stored-XSS de origen backend.
- Prioridad **P1** · Talla M · REVERSIBLE · Agente: `security-engineer`.
- Dependencias: interactúa con W1-SEC-02 (media). · Spec: `spec/modules/uploads-spec.md`. · Acceptance:
  subir `.html`/ejecutable → rechazado o servido como adjunto; archivo >límite → 413. · Pruebas: matriz
  de tipos/tamaños. · Rollback: revertir config. · Criterios: (1) tipos activos no inline; (2) límite
  aplicado; (3) permisos ≠ 0777.

**W1-SEC-06 · Cifrado en reposo de secretos de pago/IA/canal (P1-6, fusiona C-09+S-2)**
- Origen: `seguridad.md` S-2, `backend-canales.md` C-09. · Evidencia: `Company.ts:81-93`
  (stripe/paypal/facebook en claro), `AIProviderConfig.apiKey`, `Whatsapp.pageAccessToken/tiktok*`.
- Objetivo: extender AES-256-GCM (`helpers/secretCrypto.ts`, ya existe) a todas las columnas de
  secretos, con lectura compatible. · Gap: los secretos de mayor valor en claro.
- Prioridad **P1** · Talla L · **SENSIBLE** (migración de datos) · Agente: `security-engineer` +
  `database-architect`.
- Dependencias: **W0-INV-03** (estado de `ENCRYPTION_KEY` y migración `enc:v1:`), W0-GATE-01.
- Invariantes: lectura retrocompatible (claro↔`enc:v1:`); idempotencia del backfill.
- Spec: `spec/modules/secret-encryption-spec.md` (ya existe `marketing-secret-encryption-spec.md`,
  extender). · Acceptance: 0 columnas de secreto en claro en BD; app lee ambos formatos durante
  transición. · Pruebas: leer/escribir un secreto por gateway; verificar cifrado en BD. · Rollback:
  script inverso (descifra a claro) + restore. · Criterios: (1) BD sin secretos en claro; (2) pagos/IA
  siguen funcionando; (3) backfill idempotente.

**W1-SEC-07 · Creds Baileys en Redis: TTL + cifrado (P1-2)**
- Origen: `seguridad-privacidad.md` PR-2. · Evidencia: `helpers/useMultiFileAuthState.ts:15-25` (claro,
  sin TTL); `docker-compose.yml:93-100` (AOF+RDB, allkeys-lru).
- Objetivo: cifrar creds/signal keys antes de Redis y/o política de persistencia que no vuelque
  material sensible sin cifrar. · Gap: material de apropiación de cuenta en disco sin cifrar.
- Prioridad **P1** · Talla M · **SENSIBLE** · Agente: `security-engineer`.
- Dependencias: W0-GATE-01; cuidado: reiniciar sesiones puede exigir re-escaneo QR (memoria
  `reference_chateam_*`). · Invariantes: no invalidar sesiones vivas sin plan de re-conexión.
- Spec: `spec/modules/baileys-session-security-spec.md`. · Acceptance: creds no legibles en claro en
  Redis. · Pruebas: inspección de clave Redis (autorizada). · Rollback: revertir wrapper. · Criterios:
  (1) valor en Redis cifrado; (2) sesiones reconectan.

**W1-SEC-08 · Enforce de firma en webhooks Coingate/Telegram/Meta (P1-4/P1-5)**
- Origen: `api-contratos.md` C-05, `backend-canales.md` C-03/C-04/C-06. · Evidencia:
  `MetaSignatureValidator.ts:24,129` (default `warn`); Coingate confía en `payload.status`; Telegram sin
  secret; `/webhook/facebook` sin `rawBody`.
- Objetivo: Meta/FB en `enforce` con `rawBody`; Coingate re-consulta estado a la API; Telegram con
  `secret_token`. · Gap: webhooks forjables → créditos/planes/mensajes falsos.
- Prioridad **P1** · Talla M · **SENSIBLE** (dinero/mensajes) · Agente: `payment-integration` +
  `backend-developer`.
- Dependencias: **W0-INV-03** (confirmar `*_WEBHOOK_SECRET` en prod). · Invariantes: no perder eventos
  legítimos (fail-closed con alerta, no silencioso).
- Spec: `spec/meta-coexistencia-spec.md` (extender) + `spec/modules/webhooks-firma-spec.md`.
- Acceptance: webhook con firma inválida → rechazado y registrado; Coingate solo acredita tras
  re-fetch. · Pruebas: replay de webhook forjado. · Rollback: volver a `warn` temporal. · Criterios:
  (1) firma inválida = rechazada; (2) Coingate sin re-fetch = no acredita; (3) Telegram sin secret = 401.

**W1-SEC-09 · bcrypt cost ≥12 (P2, NFR-009)**
- Origen: `seguridad.md` S-1. · Evidencia: `models/User.ts:150` `hash(password, 8)`.
- Objetivo: cost ≥12 con **re-hash perezoso en login** (no invalida contraseñas). · Gap: por debajo de
  OWASP.
- Prioridad **P2** · Talla S · **SENSIBLE** (auth) · Agente: `security-engineer`.
- Dependencias: ninguna. · Invariantes: no forzar reset de contraseñas; compat con hashes cost-8.
- Spec: `spec/modules/roles-usuarios-spec.md` (nota auth). · Acceptance: nuevos hashes cost≥12; login
  con hash viejo funciona y re-hashea. · Pruebas: login usuario legacy + verificar nuevo cost. ·
  Rollback: revertir constante. · Criterios: (1) hash nuevo cost≥12; (2) login legacy OK.

**W1-SEC-10 · Endurecimiento P2 agrupado (SSRF, path traversal, open redirect, unsubscribe GET, OAuth
state, `/version` auth, REDIS default)**
- Origen: A-7, A-8, H-08, H-09, H-10/C-08, H-11, S-8. · Evidencia: `sendButtonResponseWebhook.ts:60`;
  filename de upload; `/tracking/click`, `/tracking/unsubscribe`; callbacks OAuth; `versionRoutes.ts:8`;
  `config/redis.ts:22` (`"MULTI100"`).
- Objetivo: allowlist de destino SSRF; sanitizar filename; token en unsubscribe + POST; `state` firmado
  OAuth; auth en `/version`; eliminar default hardcodeado. · Gap: superficie P2 dispersa.
- Prioridad **P2** · Talla L (subtareas) · REVERSIBLE (mayoría) · Agente: `security-engineer`.
- Dependencias: ninguna. · Spec: `spec/modules/security-hardening-p2-spec.md` (una por subítem).
- Acceptance/Pruebas/Rollback/Criterios: **por subítem** (cada uno con su criterio binario; ej.
  unsubscribe: GET sin token → 403). Se detallará al abrir la tarea.

**W1-SEC-11 · Fuga latente de `passwordHash` en `/api/users/:email` (H-06 — reclasificada P2 por INV-03)**
- Origen: `api-inventario.md` H-06; INV-02 (estático) + **INV-03 (mitigación por config)**. · Evidencia:
  `APIShowEmailUserService.ts:8-40` (sin `companyId`, sin `attributes` → incluye `passwordHash`,
  `User.ts:48`); `apiCompanyRoutes.ts:97` con `isAuthCompany`. **`isAuthCompany.ts:20-22`: si
  `COMPANY_TOKEN` no está, devuelve 403 a cualquier token → INV-03 halló `COMPANY_TOKEN` UNSET** → el
  endpoint no admite ningún token válido → **fuga inalcanzable externamente hoy**.
- Objetivo: excluir `passwordHash`/sensibles del `attributes` y filtrar `companyId` (fix defensivo del
  trap latente). · Gap: si `COMPANY_TOKEN` se configura alguna vez, la fuga se activa.
- Prioridad **P2 latente** (era P0; degradada por INV-03) · Talla S · **SENSIBLE** · Agente:
  `security-engineer`. · Dependencias: ninguna. · Invariantes: I-G1. · Spec:
  `spec/modules/roles-usuarios-spec.md` (nota API). · Acceptance: respuesta sin `passwordHash`; email de
  otra empresa no recuperable ni con token válido. · Pruebas: revisión de `attributes` + (si se
  configura token) sonda cross-tenant. · Rollback: revertir filtro. · Criterios: (1) `passwordHash`
  ausente; (2) filtrado `companyId`.
- **Nota funcional derivada:** con `COMPANY_TOKEN` unset, TODA `apiCompanyRoutes` está cerrada → si
  alguna integración externa la consumía, está rota (verificar con negocio).

**W1-SEC-12 · Mutaciones destructivas cross-tenant por `where:{id}` sin `companyId` (INV-05, sistémico)**
- Origen: `audit/inv/W0-INV-05.md` (causa raíz: `Delete*Service`/`Update*Service` hacen `where:{id}`
  sin `companyId`; el aislamiento recaía en un `Show*`-guard del controlador que falta/está comentado
  en 7 rutas). · Evidencia **verificada por el orquestador**:
  - **P0 · `DELETE /tickets/:ticketId`**: `TicketController.ts:389` guard `ShowTicketService` **comentado**;
    `DeleteTicketService.ts:5-14` recibe `companyId` pero hace `Ticket.findOne({where:{id}})` +
    `destroy()` → borra ticket de otra empresa **con CASCADE** (Messages 79k, LogTickets 225k);
    `ticketRoutes.ts:29` solo `isAuth`. Cross-tenant, destructivo, id secuencial. **Confianza ALTA.**
  - **P1 financiero · `GET /invoices`** (`ListInvoicesServices.ts:19-38`, where solo `detail LIKE` →
    lista facturas de todos los tenants) y **`PUT /invoices/:id`** (`UpdateInvoiceService.ts:12`
    `findByPk(id).update` → altera factura ajena).
  - **P1/P2 · DELETE** de quick-messages / announcements / tags / contact-lists / contact-list-items
    (borrado cross-tenant, mismo patrón).
- Objetivo: parche inmediato en los servicios de alto riesgo (añadir `companyId` al `where` o restaurar
  el guard) + barrido del resto del patrón. · Gap: borrado/edición cross-tenant destructivo con solo
  `isAuth`.
- Prioridad **P0** (por el DELETE de tickets) · Talla M · **SENSIBLE** (destructivo/datos) · Agente:
  `security-engineer` + `backend-developer`. · Dependencias: W0-GATE-01 (backup antes). · Invariantes:
  I-G1; no romper borrados legítimos intra-tenant. · Spec: `spec/modules/tenant-mutation-guard-spec.md`.
  · Acceptance: DELETE/PUT sobre id de otra empresa → 404/403; intra-tenant intacto. · Pruebas: sonda
  cross-tenant (autorizada) por cada verbo. · Rollback: revertir por servicio. · Criterios: (1)
  `DELETE /tickets` ajeno = 404; (2) invoices no cross-tenant; (3) los 5 DELETE del patrón acotados.
- **Alimenta W3-AUTH-01** (fix estructural de la frontera de tenant); esto son los parches puntuales
  previos, como W1-SEC-03 lo fue para el lado lectura.

### OLA 2 — Datos

**W2-DATA-01 · Columna `companyId` estructural en `LogTickets` + backfill + índice**
- Origen: DB-01. · Evidencia: `LogTickets` sin tenant (225.675 filas, 10 empresas). · Objetivo:
  `ADD COLUMN companyId` (FK), backfill vía `Tickets`, índice `(companyId,ticketId)`, filtro obligatorio.
- Prioridad **P1** (refuerza P0-3) · Talla L · **SENSIBLE** · Agente: `database-architect`/`postgres-pro`.
- Dependencias: W1-SEC-03 (parche ya vivo), W0-GATE-01. · Invariantes: backfill idempotente; sin lock
  largo (por lotes). · Spec: `spec/modules/db-tenant-hardening-spec.md`. · Acceptance: 0 filas con
  `companyId` nulo tras backfill. · Pruebas: conteo por empresa == vía Tickets. · Rollback: `DROP COLUMN`
  (script inverso). · Criterios: (1) columna+FK+índice; (2) backfill completo; (3) parche usa la columna.

**W2-DATA-02 · Resolver drift `WebhookModel` (DB-02)**
- Origen: DB-02. · Evidencia: `models/Webhook.ts:13-33` (8 columnas fantasma) vs tabla real; 10
  servicios FlowBuilder muertos. · Objetivo: decidir contrato vivo y alinear modelo↔tabla + validación
  de arranque. · Gap: subsistema webhooks FlowBuilder devuelve 500.
- Prioridad **P1** · Talla M · **SENSIBLE** (esquema) · Agente: `database-architect`. · Dependencias:
  ninguna. · Invariantes: no romper los 10 consumidores. · Spec: `spec/modules/flowbuilder-spec.md`
  (contrato webhook). · Acceptance: `findOne/update` de webhook no lanza `column does not exist`. ·
  Pruebas: ejercicio de los 10 servicios. · Rollback: restaurar modelo. · Criterios: (1) modelo==tabla;
  (2) 0 error de columna.

**W2-DATA-03 · Reconciliar drift de esquema (23 modelos ≠ tabla, 46 tablas sin migración)**
- Origen: `db-esquema.md` §4.4/4.5, DB-05. · Evidencia: 23 modelos con columnas fantasma; 46 tablas sin
  sentencia de creación en repo; 63 objetos que el repo crea y no existen. · Objetivo: baseline de
  migración que reconstruya la BD real + validación modelo↔catálogo en arranque. · Gap: el historial de
  migración no reconstruye la base.
- Prioridad **P1** · Talla **XL** (multi-fase) · **SENSIBLE** · Agente: `database-architect`. ·
  Dependencias: W0-INV (mapa exacto), W0-GATE-01. · Invariantes: no tocar datos vivos; solo alinear
  DDL/migración. · Spec: `spec/modules/schema-reconciliation-spec.md`. · Acceptance: `migrate` sobre BD
  vacía reproduce el esquema de prod. · Pruebas: migración en DB desechable. · Rollback: por fase. ·
  Criterios: (1) 0 modelos con columna fantasma en los críticos; (2) baseline reproduce esquema.

**W2-DATA-04 · Modelos no registrados llamados desde rutas montadas (`ApplePurchase`, `LeadSource`)**
- Origen: `arquitectura.md` H-5. · Evidencia: `.findOne/.create` desde `subScriptionRoutes` (montada) y
  `campaignAuditRoutes`. · Objetivo: registrar en `database/index.ts` o cablear correctamente. · Gap:
  bug latente en verificación Apple IAP y auditoría de campañas.
- Prioridad **P1** · Talla S · REVERSIBLE · Agente: `backend-developer`. · Spec: nota en
  `spec/modules/suscripciones-planes-spec.md`. · Acceptance: la ruta no lanza al llamar el modelo. ·
  Pruebas: invocar el endpoint. · Rollback: revertir registro. · Criterios: (1) modelo resuelto; (2)
  endpoint no 500.

**W2-DATA-05 · Política de retención + particionado (`LogTickets`, `InboundEventLedger`) (NFR-012)**
- Origen: `db-esquema.md`, `rendimiento.md` R-04. · Evidencia: 0 tablas particionadas; sin TTL. ·
  Objetivo: retención 90-180d + particionado. · Gap: crecimiento sin control.
- Prioridad **P2** · Talla L · **SENSIBLE** · Agente: `database-architect`. · Dependencias:
  W0-GATE-01. · Spec: `spec/modules/data-retention-spec.md` + **asunto jurídico** (retención legal). ·
  Acceptance: partición activa + job de purga idempotente. · Pruebas: purga en muestra. · Rollback:
  desactivar job. · Criterios: (1) particionado; (2) purga idempotente; (3) retención documentada.

**W2-DATA-06 · Decisión de soft-delete (spec-gate, no implementación aún)**
- Origen: `db-esquema.md` §4.7 (0 soft-delete). · Prioridad **P3** · Talla — (spec) · Agente:
  `database-architect`. · **Requiere spec de producto**: ¿se necesita borrado lógico? Hoy 4
  convenciones (`status/isActive/active/isDeleted`) sin interceptar `DELETE`. Criterio: decisión
  documentada antes de cualquier implementación.

**W2-DATA-07 · Reproceso de 753 mensajes Meta perdidos (C-05)**
- Origen: `backend-canales.md` C-05. · Evidencia: el ledger reserva el evento antes de procesarlo. ·
  Objetivo: cambiar a "procesar→confirmar" + reproceso de la DLQ. · Gap: mensajes entrantes perdidos sin
  reintento. · Prioridad **P1** · Talla M · **SENSIBLE** · Agente: `backend-architect`. · Spec:
  `spec/modules/inbound-ledger-spec.md`. · Acceptance: fallo de proceso → evento reintenta, no se pierde.
  · Pruebas: inyección de fallo simulado. · Rollback: revertir orden. · Criterios: (1) evento fallido
  reprocesa; (2) DLQ drenable.

### OLA 3 — Auth / RBAC / Multitenancy

**W3-AUTH-01 · Materializar la frontera de tenant (RC-1, estructural)**
- Origen: `arquitectura.md` H-7, `seguridad.md`. · Evidencia: `tenantMiddleware` montado en 0 rutas de
  `routes/index.ts`. · Objetivo: middleware de tenant transversal + auditoría de que cada servicio de
  listado filtra `companyId` (a partir de W0-INV-05). · Gap: aislamiento depende de convención.
- Prioridad **P1** (tras los P0 puntuales) · Talla **XL** · **SENSIBLE** · Agente: `backend-architect`
  + `security-engineer`. · Dependencias: W1-SEC-01/02/03 (P0 puntuales primero), W0-INV-05. ·
  Invariantes: no romper endpoints cross-company legítimos del super. · Spec:
  `spec/modules/multitenancy-spec.md`. · Acceptance: suite de sondas 79+×4 perfiles sin fuga. ·
  Pruebas: sonda RBAC completa. · Rollback: por fase. · Criterios: (1) 0 fugas en sonda; (2) super sigue
  operando cross-company donde debe.

**W3-AUTH-02 · Enforce de RBAC fino en backend (H-04)**
- Origen: `api-inventario.md` H-04. · Evidencia: modelo `Role.permissions` servido al cliente, **nunca
  evaluado en backend**; 4,6% rutas con `isSuper`. · Objetivo: middleware que evalúe `Role.permissions`
  server-side. · Gap: RBAC decorativo; cualquier `isAuth` alcanza ~792 rutas.
- Prioridad **P1** · Talla **XL** · **SENSIBLE** · Agente: `security-engineer`. · Dependencias:
  W3-AUTH-01. · Invariantes: no bloquear a usuarios legítimos por permiso mal mapeado (rollout con
  modo `warn`→`enforce`). · Spec: `spec/modules/roles-usuarios-spec.md` (migración
  `profile`→`Role.ts`). · Acceptance: endpoint sensible sin permiso → 403 en backend. · Pruebas: matriz
  permiso×endpoint. · Rollback: modo `warn`. · Criterios: (1) permiso evaluado en backend; (2) sin
  falsos 403 en flujos core.

**W3-AUTH-03 · Excluir secret keys propias a rol `user` (S-4)**
- Origen: `seguridad.md` S-4. · Evidencia: `/companies/find|:id|list` devuelven secret keys de la propia
  empresa a `user`. · Objetivo: exclusión de atributos `*Secret*` salvo pantalla explícita de
  credenciales. · Prioridad **P2** · Talla S · REVERSIBLE · Agente: `backend-developer`. · Spec: nota en
  `spec/modules/super-admin-spec.md`. · Acceptance: `user` no ve secret keys. · Pruebas: sonda perfil
  user. · Rollback: revertir. · Criterios: (1) payload sin `*Secret*` para user.

### OLA 4 — Funcionalidad

**W4-FUNC-01 · Resolver endpoints en 500 (REDUCIDA por INV-01: solo 2)**
- Origen: `MATRIZ` NFR-003, confirmado `audit/inv/W0-INV-01.md`. · Evidencia: INV-01 midió los 13; **11
  ya responden 200** (perfil super), solo **`/ticketreport/reports` y `/announcements/list` siguen en
  500** (`{"error":"Internal server error"}`, causa no logueada). · Objetivo: esos 2 en 200. · Gap:
  reporte de tickets y listado de comunicados rotos. · Prioridad **P2** (reducida desde P1) · Talla
  **S/M** (reducida desde L) · REVERSIBLE · Agente: `backend-developer`. · Dependencias: ninguna
  (INV-01 hecho). · Invariantes: I-G1. · Spec: nota en `spec/modules/tickets-spec.md` y `announcements`.
  · Acceptance: ambos 200 con su contrato; barrido ×4 perfiles sin 500. · Pruebas: sonda ×4 perfiles +
  con/sin params. · Rollback: por endpoint. · Criterios: (1) los 2 en 200; (2) sin regresión ×4 perfiles.
- **Pendiente INV**: barrido ×4 perfiles y con parámetros requeridos (INV-01 solo cubrió super sin
  params).

**W4-FUNC-02 · Campañas WhatsApp: página huérfana `WhatsAppCampaigns.tsx` (FR-011)**
- Origen: `frontend.md`. · Evidencia: 5 `fetch()` crudos, 0 referencias, no ruteada; `Campaigns`=0
  filas. · Objetivo: **decidir** — cablear a `api` + ruta, o eliminar la huérfana (el flujo real usa
  `CampaignController`). · Gap: código muerto + flujo de campañas a confirmar. · Prioridad **P2** ·
  Talla M · REVERSIBLE · Agente: `frontend-developer`. · **Requiere spec** (¿es el flujo vivo?). ·
  Acceptance: campaña de prueba crear→enviar→ver estado, o página eliminada sin regresión. · Rollback:
  restaurar. · Criterios: (1) sin `fetch` crudo; (2) flujo probado o página fuera.

**W4-FUNC-03 · Zonas MOCK: decisión producto (Leads, AppointmentsReports, Integraciones) (RC-5)**
- Origen: `frontend.md`. · Evidencia: `Leads.tsx` (mockLeads), `AppointmentsReports.tsx`
  (mockAgentReports/pravatar), `pages/Integrations/*` (arrays hardcodeados). · Objetivo: por cada zona:
  implementar con API real o retirar de navegación productiva. · Gap: maquetas presentadas como
  producto. · Prioridad **P2** · Talla L · REVERSIBLE · Agente: `frontend-developer`+`backend-developer`.
  · **Requiere spec** por módulo. · Acceptance: la pantalla consume API real o no aparece en menú
  productivo. · Criterios: (1) 0 arrays mock en pantallas productivas.

**W4-FUNC-04 · Verificar providers de Email operativos (FR-016)**
- Origen: `frontend`/SPEC. · Evidencia: SendGrid/SES/Carbonio marcados stub. · Objetivo: confirmar
  cuáles envían de verdad; marcar el resto como no disponible en UI. · Prioridad **P2** · Talla M ·
  REVERSIBLE · Agente: `backend-developer`. · **Requiere INV** (envío de prueba autorizado). ·
  Acceptance: solo providers operativos seleccionables. · Criterios: (1) stubs ocultos/deshabilitados.

### OLA 5 — APIs / Integraciones

**W5-API-01 · Estandarizar envelope de respuesta (NFR-020)**
- Origen: `api-contratos.md` C-01. · Evidencia: 82 `{success,data}` vs 85 planos, 11 mixtos, sin helper.
  · Objetivo: helper de respuesta único + contrato declarado por endpoint; migración incremental
  (strangler). · Gap: el front hace parsing defensivo por el triple envelope. · Prioridad **P2** ·
  Talla **XL** · REVERSIBLE (por endpoint) · Agente: `api-designer`. · Spec: `spec/standards-api-spec.md`.
  · Acceptance: endpoints migrados usan el helper; front deja de hedge. · Pruebas: contrato por
  endpoint. · Rollback: por endpoint. · Criterios: (1) helper adoptado en migrados; (2) sin regresión
  de front.

**W5-API-02 · Versionado `/v1` + API keys con scope (gap G2)**
- Origen: `api-contratos.md` C-04. · Evidencia: 0 rutas `/v1`; `tokenAuth` global sin scope. · Objetivo:
  prefijo de versión + keys por company con scope. · Prioridad **P3** · Talla L · REVERSIBLE · Agente:
  `api-designer`. · Spec: `spec/modules/api-keys-spec.md`. · Acceptance: key con scope limita alcance. ·
  Criterios: (1) `/v1` disponible; (2) key fuera de scope = 403.

**W5-API-03 · `/version` con autenticación (H-11)**
- Origen: `api-inventario` H-11, `api-contratos` C-02. · Evidencia: `versionRoutes.ts:8` escribe sin
  auth. · Objetivo: exigir auth (super) para mutar versión global. · Prioridad **P2** · Talla S ·
  REVERSIBLE · Agente: `backend-developer`. · Acceptance: `POST /version` sin super → 403. · Criterios:
  (1) mutación protegida.

**W5-API-04 · `/internal/*` no accesible desde Internet (H-01, CONFIRMADO INV-02 → P0)**
- Origen: `api-inventario` H-01, confirmado `audit/inv/W0-INV-02.md`. · Evidencia: guard por `req.ip`
  (`internal.ts:109-116`) anulado porque **`trust proxy` no está configurado** → `req.ip`=127.0.0.1
  tras nginx; `/be/` reenvía a `:3010/` sin bloquear `/internal` (nginx conf:38); expone
  `POST /internal/wbot-call` (`internal.ts:310`, invocación arbitraria de métodos del wbot),
  `/internal/send`, restart/delete/edit.
- Objetivo: bloquear `/internal` en el borde nginx **y** endurecer el guard (secreto compartido entre
  nodos, no `req.ip`). · Gap: abuso no autenticado de sesiones WhatsApp de todos los tenants desde
  Internet. · Prioridad **P0** (reclasificada desde P1) · Talla S · **SENSIBLE** · Agente:
  `devops-engineer` + `security-engineer`. · Dependencias: ninguna (parche de borde inmediato). ·
  Invariantes: no romper la comunicación inter-nodo legítima. · Spec:
  `spec/modules/internal-routes-spec.md`. · Acceptance: `/be/internal/*` desde Internet → 403; nodo
  interno sigue operando. · Pruebas: sonda externa vs interna (autorizada). · Rollback: revertir regla
  nginx/guard. · Criterios: (1) `/internal` no alcanzable externamente; (2) ruteo inter-nodo intacto.

### OLA 6 — Rendimiento / Infra

**W6-PERF-01 · Caché del dashboard (NFR-001)**
- Origen: `rendimiento.md` R-06. · Evidencia: `GetDashboardDataService` ~15 `.count()` en vivo sin
  caché → 2.629ms. · Objetivo: cachear agregados (Redis) con invalidación por evento. · Prioridad **P2**
  · Talla M · REVERSIBLE · Agente: `performance-engineer`. · Dependencias: W0-INV-10. · Spec: nota en
  `spec/modules/dashboard-spec.md`. · Acceptance: p95 < 800ms medido. · Pruebas: sonda de latencia. ·
  Rollback: quitar caché. · Criterios: (1) p95 < 800ms.

**W6-PERF-02 · Paginación de `/dashboard/moments` (NFR-002)**
- Origen: `rendimiento.md` R-02. · Evidencia: `TicketsQueuesService.ts:105-114` `findAndCountAll` sin
  `limit`. · Objetivo: paginación server-side obligatoria. · Prioridad **P2** · Talla S · REVERSIBLE ·
  Agente: `performance-engineer`. · Acceptance: p95 < 1.500ms. · Criterios: (1) respuesta paginada; (2)
  p95 < 1.500ms.

**W6-PERF-03 · Reducir ruta eager del bundle (NFR-016)**
- Origen: `rendimiento.md` R-07. · Evidencia: eager 355KB gz (>300). · Objetivo: ≤300KB gz (diferir
  mui-joy/icons). · Prioridad **P3** · Talla M · REVERSIBLE · Agente: `frontend-developer`. ·
  Acceptance: entry ≤300KB gz. · Criterios: (1) medición ≤300KB.

**W6-INFRA-01 · Observabilidad: montar `/metrics` + stack Prometheus (NFR-015)**
- Origen: `devops.md`. · Evidencia: `routes/healthRoutes.ts:100` no montado → `/metrics` 404;
  Prometheus/Grafana sin correr. · Objetivo: montar el router rico y levantar el stack de monitoreo. ·
  Prioridad **P2** · Talla M · REVERSIBLE · Agente: `devops-engineer`. · Acceptance: `/metrics` 200 +
  dashboards vivos. · Criterios: (1) `/metrics` 200; (2) probe externo de `/health`.

**W6-INFRA-02 · Arreglar CI (build antes de migrate; `load-test.js`)**
- Origen: `qa.md`, `devops.md`. · Evidencia: job `test` corre `db:migrate` sin `dist/`; performance
  invoca script inexistente. · Objetivo: orden build→migrate; script de carga real o retirar job. ·
  Prioridad **P2** · Talla M · REVERSIBLE · Agente: `devops-engineer`. · Acceptance: CI corre en verde
  en la rama viva. · Criterios: (1) pipeline verde real.

**W6-INFRA-03 · Canonizar entrypoint (package.json/PM2/ecosystem)**
- Origen: `arquitectura.md` H-1, `devops.md`. · Evidencia: `package.json` main/start →
  `server-simple.ts`; PM2 corre `server-distributed.ts`; 3 ecosystems. · Objetivo: declarar
  `server-distributed.ts` como único entrypoint; retirar `server.ts`/`ecosystem.config.cjs` obsoletos. ·
  Prioridad **P2** · Talla S · REVERSIBLE · Agente: `devops-engineer`. · Acceptance: `npm start` y PM2
  apuntan al mismo binario. · Criterios: (1) un solo entrypoint canónico documentado.

### OLA 7 — Frontend (Flutter N/A)

> **Flutter / móvil: N/A** — no existe `pubspec.yaml` en el repo. Sin objeto de tarea.

**W7-FE-01 · Consolidación de design system (NFR-018) — deuda estratégica**
- Origen: `frontend.md`. · Evidencia: 3 sistemas (MUI Joy 213 archivos, Material 5, Tailwind/shadcn 168).
  · Objetivo: converger a uno (decisión de producto). · Prioridad **P3** · Talla **XL** · REVERSIBLE ·
  Agente: `frontend-developer`+`ui-ux-designer`. · **Requiere spec de marca** (BR-007, logo pendiente). ·
  Acceptance: ≤2 familias, tokens únicos. · Criterios: por fase. · **Deuda aceptada** hasta decidir marca.

**W7-FE-02 · i18n (NFR-013) — pendiente de negocio**
- Origen: `frontend.md`. · Evidencia: 0 `useTranslation`; `i18n.t()` legacy en 4 páginas. · Objetivo:
  activar i18n **si** el negocio lo pide (BR/NFR-013). · Prioridad **P3** · Talla L · REVERSIBLE ·
  Agente: `frontend-developer`. · **Bloqueado por decisión JC** (¿EN/PT?). · Criterio: no se abre sin
  BR confirmado.

**W7-FE-03 · Correcciones a11y (tras W0-INV-06)**
- Origen: `frontend`/NFR-017. · Evidencia: axe no ejecutado (INV-06). · Objetivo: 0 críticas axe en
  flujos core. · Prioridad **P3** · Talla L · REVERSIBLE · Agente: `frontend-developer`. · Dependencias:
  **W0-INV-06**. · Criterios: (1) 0 críticas axe en core.

### OLA 8 — Deuda

**W8-DEBT-01 · Índices sin uso/duplicados**
- Origen: `rendimiento.md` R-04, `db-esquema`. · Evidencia: 20 índices sin uso + 11 pares duplicados;
  `InboundEventLedger` 49% overhead. · Objetivo: eliminar duplicados/no usados (ventana de uso ≥
  uptime). · Prioridad **P3** · Talla M · **SENSIBLE** (DDL) · Agente: `postgres-pro`. · Dependencias:
  W0-GATE-01. · Acceptance: sin índices duplicados; escrituras más rápidas. · Rollback: recrear índice.
  · Criterios: (1) duplicados eliminados; (2) queries clave intactas.

**W8-DEBT-02 · Retirar scripts/entrypoints obsoletos**
- Origen: `devops.md`, `arquitectura.md`. · Evidencia: `backup.sh`/`deploy-production.sh`/`health-check.sh`
  a infra inexistente; `server.ts` (worker duplicado), `server-simple.ts`. · Objetivo: eliminar o marcar
  `.example`. · Prioridad **P3** · Talla S · REVERSIBLE · Agente: `devops-engineer`. · Dependencias:
  W6-INFRA-03. · Criterios: (1) solo scripts vivos en repo.

**W8-DEBT-03 · Split del god-object `wbotMessageListener.ts` (staged)**
- Origen: `arquitectura`/`rendimiento`. · Evidencia: 6.764 líneas, fan-in 28/out 90. · Objetivo:
  extraer por fases con tests de caracterización. · Prioridad **P3** · Talla **XL** · **SENSIBLE**
  (núcleo de ingesta) · Agente: `refactoring-specialist`. · **Deuda aceptada**; requiere tests antes. ·
  Criterios: por fase, sin cambio de comportamiento observable.

**W8-DEBT-04 · Dependencias circulares (tras W0-INV-07)**
- Origen: `arquitectura` (154 ciclos, NO VERIFICABLE). · Objetivo: romper los ciclos de lógica (49
  reales). · Prioridad **P3** · Talla L · REVERSIBLE · Agente: `refactoring-specialist`. · Dependencias:
  **W0-INV-07**. · Criterios: (1) ciclos de lógica reducidos con grafo antes/después.

---

## 4. Resumen de priorización

| Prioridad | Tareas |
|---|---|
| **P0** (5 activos) | W1-SEC-01 (socket), W1-SEC-02 (/public), W1-SEC-03 (LogTickets lectura), **W1-SEC-12 (DELETE /tickets destructivo cross-tenant, INV-05)**, **W5-API-04 (H-01 /internal, confirmado en vivo)** (+ habilitadores W0-GATE-01/02) |
| **P1** | W1-SEC-04, W1-SEC-06 (desbloqueada, ENCRYPTION_KEY presente), W1-SEC-07, W1-SEC-08 (Meta `warn` confirmado; Coingate→P3), W2-DATA-01/02/03/04/07, W3-AUTH-01/02, W1-SEC-05 |
| **P2 (latentes/menores)** | **W1-SEC-11 (H-06, mitigada por COMPANY_TOKEN unset)**, W4-FUNC-01 (2 endpoints), W1-SEC-09/10, W3-AUTH-03, resto §previo |
| **P2** | W1-SEC-09/10, W2-DATA-05, W3-AUTH-03, W4-FUNC-02/03/04, W5-API-01/03, W6-PERF-01/02, W6-INFRA-01/02/03 |
| **P3** | W2-DATA-06, W5-API-02, W6-PERF-03, W7-FE-01/02/03, W8-DEBT-01/02/03/04 |
| **INV** | W0-INV-01..10 (no implementación) |

## 5. Deuda aceptada (registrada, fuera de este ciclo salvo decisión)
- Consolidación de 3 design systems (W7-FE-01) — atada a decisión de marca (BR-007, logo pendiente).
- Split del god-object (W8-DEBT-03) — requiere tests de caracterización primero.
- i18n (W7-FE-02) — pendiente de decisión de negocio BR/NFR-013.
- RBAC fino en backend (W3-AUTH-02) — interino aceptable: tenant por-query **si** los P0 caen.
- Soft-delete (W2-DATA-06) — pendiente de spec de producto.

## 6. Asuntos jurídicos que condicionan tareas (no técnicos)
De `SEGURIDAD_MODELO_AMENAZAS.md §10`: retención (W2-DATA-05), derecho al olvido físico vs lógico,
exportación/portabilidad, consentimiento de campañas, cookie consent, transferencia internacional, PCI,
notificación de brechas. **No se planifica implementación legal sin validación jurídica externa.**

---

## 7. Cierre

Plan **preliminar**. Cada tarea exige, antes de implementar: (a) spec + acceptance propios, (b)
aprobación humana (Reglas 2, 6, 8), (c) las tareas SENSIBLES, backup+script inverso+idempotencia+
verificación aguas abajo (Regla 9). **No se ha modificado código.** Detención aquí como ordena el
prompt de fase — no se detalla implementación ni se ejecuta ninguna ola.
