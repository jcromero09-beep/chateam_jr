# Auditoría de FRONTEND — chateam_jr

> Parte del programa de auditoría spec-driven. Confronta `docs/_consolidado/spec/SPEC.md`
> (§2 roles, §5 módulos, §6 RNF) y `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md`
> (FR-001..FR-024, NFR-016/017/018/020) contra `frontend/src` real.
> Fecha: 2026-07-23 · Modo: SOLO LECTURA (sin build, sin tests, sin tocar prod).

## 1. Alcance

- Raíz auditada: `/home/jcromero09/chateam_jr/frontend/src`.
- Superficie confirmada: **172 páginas `.tsx`** (165 top-level + 7 en `pages/Integrations/`) y
  **120 componentes `.tsx`** — coincide con el brief.
- Enrutado: `frontend/src/App.tsx` (509 líneas) declara las rutas; `frontend/src/components/AppLayout.tsx`
  (1.973 líneas) es el shell de navegación (174 referencias a rutas/menú).
- Cliente HTTP: `frontend/src/services/api.ts` (axios, `baseURL=VITE_API_URL`, interceptor de token).
- Config: `frontend/.env` → `VITE_API_URL=https://padeldev.codigo.plus/be`.
- Ejes auditados: (1) rutas/pantallas operativas vs huérfanas/mock; (2) contrato de tipos vs envelope;
  (3) sistema(s) de diseño; (4) i18n; (5) bundle/lazy; (6) huérfanos; (7) hardcodes URL/token / `fetch()` crudo.

## 2. Método

Grep/find recursivos sobre `frontend/src` + lectura dirigida. Comandos representativos:
- Sistemas de diseño: `grep -rl "@mui/joy" | wc -l`, `grep -rl "@mui/material"`, `grep -rl "@/components/ui"`.
- i18n: `grep -rl "useTranslation"`, `grep -rc "i18n.t(" pages/`.
- `fetch()` crudo: `grep -rn "fetch(" pages/`.
- Huérfanos: extracción de `import('./pages/X')` de `App.tsx` (comillas simples y dobles) vs `find pages -maxdepth 1 -name '*.tsx'`, luego `comm -23`.
- Envelope: inspección de consumo de `response.data` en Tickets/Dashboard/Campaigns/Contacts + `types/`.
- Bundle: `grep -c lazy App.tsx`, `vite.config.ts`, tamaños en `frontend/dist/assets`.

**Limitación:** no se ejecutó `npm run build` ni se midió gzip real de arranque (prohibido). Los tamaños
citados de `dist/` son del build existente (2026-07-19), sin comprimir.

---

## 3. Hallazgos

### H-01 · Rutas declaradas vs existentes — EXISTE (mayoría operativa)
- **Evidencia:** `App.tsx` importa/enruta **161 módulos de página** (159 `lazy()` + 2 eager: `Login`,
  `SignUp`, líneas 16-17). Los 172 `.tsx` de `pages/` incluyen 7 sub-componentes en `pages/Integrations/`
  y 4 no-ruteados (ver H-02). **135/165** páginas top-level llaman `api.*` directamente; ~10 más delegan
  en `services/*Service.ts` → **~145/165 cableadas a API real**.
- **FR:** transversal (FR-001..FR-024). **Confianza:** alta.

### H-02 · Páginas huérfanas / muertas — OBSOLETO
- **Evidencia (`comm -23` rutas vs archivos):** 4 top-level no ruteadas en `App.tsx`:
  - `pages/KanbanOLD.tsx` — 0 referencias en todo `src` → **código muerto**.
  - `pages/WhatsAppCampaigns.tsx` — 0 referencias → **huérfana** (y es donde viven los 5 `fetch()` crudos, ver H-12).
  - `pages/CustomerOrigins.tsx` + `pages/CustomerOriginReports.tsx` — **NO muertas**: se renderizan como pestañas
    dentro de `CustomerOriginsHub.tsx:6-7,94` (embebidas, EXISTE).
- **NFR:** deuda técnica / NFR-018. **Confianza:** alta.

### H-03 · Contrato de tipos vs envelope `{success,data}` — PARCIAL (hipótesis del brief refutada)
- **Evidencia:** **NO existe** un tipo compartido `ApiResponse<{success,data}>`; `types/` solo tiene
  `i18n.d.ts`, `Message.ts`, `qrcode.d.ts`, `toastError.d.ts`. El front **no asume rígidamente** el
  envelope: lee `response.data` plano o defiende con cadenas `||`/`??`:
  - `Dashboard.tsx:154` → `setStats(response.data)` (asume **plano**).
  - `Tickets.tsx:643` → `res.data.users || res.data.records || []`; `:750-753` → `data.totalCount ?? data.count ?? 0`.
  - `Contacts.tsx:254` → `response.data.contacts || response.data || []`; `:222` → `Array.isArray(response.data)`.
  - `Campaigns.tsx:720` → `res.data?.record ?? res.data`.
- **Lectura:** la hipótesis "el front asume envelope pero el back devuelve plano" es **falsa**; el riesgo real
  es lo contrario: **contrato no tipado**, drift de forma enmascarado por fallbacks (94 archivos citan `.success`),
  fricción de mantenimiento. Refuerza NFR-020 (envelope inconsistente) desde el lado cliente.
- **FR/NFR:** FR-001/003/011/023, **NFR-020**. **Confianza:** alta.

### H-04 · Doble sistema de diseño MUI Joy + Material — EXISTE (deuda confirmada)
- **Evidencia:** `@mui/joy` en **213 archivos** (116 páginas); `@mui/material` en solo **5**
  (`App.tsx`, `theme/materialTheme.ts`, `components/FlowBuilderCitasModal`, `components/Messages/RoutingPolicySelector`,
  `pages/KanbanOLD` [huérfana]). `App.tsx:259-260` envuelve **ambos** providers
  (`MaterialCssVarsProvider` + Joy `CssVarsProvider`). Material es residual salvo por el provider global.
- **NFR:** **NFR-018**. **Confianza:** alta.

### H-05 · TERCER sistema de diseño (Tailwind + shadcn/ui) — EXISTE (peor que lo declarado)
- **Evidencia:** `frontend/src/components/ui/` = librería shadcn (`button.tsx`, `dialog.tsx`, `input.tsx`,
  `dropdown-menu.tsx`, `tabs`, …). **168 páginas** importan `@/components/ui`; **171 páginas** usan `className=`
  (Tailwind); existe `src/tailwind.css` (6.3 KB). El SPEC solo declara "Joy + Material"; la realidad es un
  **triple stack** (Joy dominante · Material vestigial · Tailwind/shadcn tan extendido como Joy). Amplifica NFR-018.
- **NFR:** **NFR-018**. **Confianza:** alta.

### H-06 · i18n — PARCIAL (SPEC "0 páginas" impreciso)
- **Evidencia:** `useTranslation` (hook react-i18next) = **0 archivos** (confirma "0 uso" del hook). Pero existe
  un **singleton legacy** `src/translate/i18n.js` (24 KB) usado vía `i18n.t(...)` en **4 páginas**:
  `Prompts.tsx` (51), `AISubplans.tsx` (66), `AIImageGeneration.tsx` (8), `OpenAISettings.tsx` (82) = **207 llamadas**.
  Las ~161 páginas restantes son español hardcodeado.
- **NFR:** **NFR-013**. **Confianza:** alta.

### H-07 · Bundle / lazy por ruta — OBSOLETO en SPEC / PARCIAL real
- **Evidencia:** `App.tsx` actual = **159 `lazy()` + 2 eager**. `vite.config.ts:62-67` define `manualChunks`
  (`mui-joy`, `mui-icons`, `react-vendor`, `charts`). `dist/assets` = **340 chunks JS** code-split (5.9 MB sin
  comprimir); entry `index-*.js` = 393 KB, `mui-joy` 441 KB, `Tickets` 456 KB (chunk propio).
  El eager que midió el SPEC ("103 páginas eager, 2.75 MB / 703 KB gz") vive en el backup `App.tsx.bak_lazy`
  (103 imports estáticos) → **la observación NFR-016 del SPEC está desactualizada**; la migración a lazy ya se hizo.
- **NFR:** **NFR-016**. **No verificable aquí:** si el arranque cumple ≤300 KB gz (no se midió gzip). **Confianza:** alta (lazy hecho) / media (meta gz).

### H-08 · MOCK — `Leads.tsx` sin API real
- **Evidencia:** `pages/Leads.tsx:122-124` tiene la llamada real **comentada** (`// const response = await api.get('/leads')`)
  y `:306` hace `setLeads(mockLeads)` — datos hardcodeados (`María García`, `Tech Solutions SA`…). Renderiza pero **no consume API**.
- **FR:** **FR-006** (Funnel/Leads). **Clasif.: MOCK.** **Confianza:** alta.

### H-09 · MOCK — `AppointmentsReports.tsx` sin API
- **Evidencia:** sin ningún `api.get`; `pages/AppointmentsReports.tsx:67` define `mockAgentReports` (avatares
  `https://i.pravatar.cc/150`) y lo renderiza directo (`:455 mockAgentReports.map`), agregados en `:305-308`.
- **FR:** **FR-007** (Citas/Reportes). **Clasif.: MOCK.** **Confianza:** alta.

### H-10 · MOCK — módulo "Integraciones Internas" es maqueta UI
- **Evidencia:** páginas ruteadas que renderizan **arrays hardcodeados**, sin `api`/`service`:
  - `IntegrationsDashboard.tsx:106` `const integrations: Integration[] = [...]`; `:179` `const recentLogs: SyncLog[] = [...]`.
  - `IntegrationBillie.tsx:197` `const syncHistory: SyncRecord[] = [...]`; `:173,183` URLs default hardcodeadas.
  - Misma firma (0 api / 0 service / childRefs de formulario) en `IntegrationSmartTrack`, `IntegrationSGR`, `IntegrationAriaLite`.
- **FR:** integraciones internas (Billie/AriaLite/SmartTrack/SGR). **Clasif.: MOCK.** **Confianza:** alta (2 verificadas, 3 inferidas por firma idéntica).

### H-11 · PARCIAL — páginas con fallback mock ante error
- **Evidencia:** consumen API real como primaria, con mock de respaldo:
  - `CampaignsAttribution.tsx:186-200` "Use mock data as fallback if no real data" (FR-018).
  - `CommentAutoReplyDashboard.tsx:86 MOCK_STATS`, `:240 setStats(MOCK_STATS)` con aviso "Mostrando datos de ejemplo" (FR-009).
  - `AppointmentsDashboard.tsx:220` distribución derivada en cliente ("in production this should come from backend") (FR-007).
- **Contraste (EXISTE):** `Announcements.tsx:110` y `InternalChats.tsx:189` **eliminaron** el mock ("use real API data only").
- **Clasif.: PARCIAL.** **Confianza:** alta.

### H-12 · `fetch()` crudo sin baseURL/token — EXISTE (bug real) pero en página OBSOLETA
- **Evidencia:** **5** `fetch()` crudos, **todos** en `pages/WhatsAppCampaigns.tsx`
  (`:130 /campaigns`, `:137 /whatsapp`, `:144 /contact-lists`, `:151 /whatsapp-templates?status=APPROVED`,
  `:221 POST /campaigns`) — rutas relativas, **sin `baseURL`, sin `Authorization`**, sin usar `services/api`.
  Con `VITE_API_URL=…/be`, un `fetch('/campaigns')` pega al origen del SPA (sin `/be`) → **404 en prod** y sin auth.
  **Confirma el P0 citado en SPEC §5.** **Matiz:** `WhatsAppCampaigns` es **huérfana** (H-02, 0 refs, no ruteada) →
  el bug es **inalcanzable por UI**; el fix natural es borrar la página o migrarla a `api` antes de ruteo.
- **FR/NFR:** FR-011, NFR-020. **Confianza:** alta.

### H-13 · Hardcodes de URL / secretos — PARCIAL (sin secretos; sí URLs default)
- **Evidencia:** **0** secretos literales (`Bearer …`, `sk-…`, `apiKey:'…'`) en `pages/`+`components/`.
  Sí hay URLs placeholder/default en formularios de config: `api.jrchateam.com/webhooks/{billie,sgr,smarttrack,aria}`,
  `api.billie.com/v2.5`, `api.openai.com/v1`, `external.api.com`, `example.com`, `tu-dominio.com`, y avatares
  mock `i.pravatar.cc` (`AppointmentsReports`). Son valores por defecto de campos / mock, no llamadas vivas.
- **NFR:** NFR-006 (no aplica cliente) / higiene. **Confianza:** alta.

### H-14 · OBSOLETO — "11 modales de nodo FlowBuilder vacías" (SPEC §5)
- **Evidencia:** las 12 carpetas `components/FlowBuilder*Modal/` tienen `index.jsx` **implementado**
  (5.6 KB–49.8 KB; `FlowBuilderSingleBlockModal` 49.8 KB, `FlowBuilderCitasModal` 301 líneas `.tsx`).
  **No están vacías** → la afirmación del SPEC está desactualizada. Deuda menor: 11 de 12 son `.jsx` legacy (sin tipos).
- **FR:** FR-012 (FlowBuilder). **Confianza:** alta.

### H-15 · EXISTE — Dashboard consume API real (no mock pese al nombre)
- **Evidencia:** `Dashboard.tsx:151` `api.get('/dashboard')`, `:154 setStats(response.data)`. El import
  `@/lib/mock/dashboard` (`:23`) es **solo tipos** — el propio archivo declara "No mock values are exported"
  (`lib/mock/dashboard.ts`). Los widgets (`StatCard`, `TicketsDonut`, `ActivityChart`) reciben datos reales.
- **FR:** **FR-023**. **Confianza:** alta.

---

## 4. Tabla resumen

| # | Hallazgo | Clasificación | FR/NFR | Confianza |
|---|---|---|---|---|
| H-01 | Rutas declaradas ≈ existentes; ~145/165 cableadas a API | EXISTE | FR-001..024 | Alta |
| H-02 | Huérfanas: `KanbanOLD`, `WhatsAppCampaigns` (0 refs) | OBSOLETO | NFR-018 | Alta |
| H-03 | Sin tipo envelope; consumo defensivo `||`/`??` (hipótesis refutada) | PARCIAL | NFR-020, FR-001/023 | Alta |
| H-04 | Doble sistema MUI Joy (213) + Material (5) | EXISTE | NFR-018 | Alta |
| H-05 | Tercer sistema Tailwind/shadcn (168 páginas) | EXISTE | NFR-018 | Alta |
| H-06 | i18n: 0 `useTranslation`; singleton `i18n.t` en 4 páginas | PARCIAL | NFR-013 | Alta |
| H-07 | Lazy por ruta ya migrado; SPEC "103 eager" desactualizado | OBSOLETO | NFR-016 | Alta |
| H-08 | `Leads.tsx`: API comentada, renderiza `mockLeads` | MOCK | FR-006 | Alta |
| H-09 | `AppointmentsReports.tsx`: sin API, `mockAgentReports` | MOCK | FR-007 | Alta |
| H-10 | Integraciones Internas (Billie/SGR/SmartTrack/AriaLite/Dash) maqueta | MOCK | Integraciones | Alta |
| H-11 | Fallback mock ante error (Attribution/CommentAutoReply/ApptDash) | PARCIAL | FR-018/09/07 | Alta |
| H-12 | 5 `fetch()` crudos en `WhatsAppCampaigns` (P0) — página huérfana | EXISTE (bug) | FR-011, NFR-020 | Alta |
| H-13 | Sin secretos literales; sí URLs default/placeholder + avatares mock | PARCIAL | higiene | Alta |
| H-14 | Modales FlowBuilder implementadas (SPEC "11 vacías" falso) | OBSOLETO | FR-012 | Alta |
| H-15 | Dashboard consume `/dashboard` real; `lib/mock` es solo tipos | EXISTE | FR-023 | Alta |

**Conteo por clasificación:** EXISTE ×4 · PARCIAL ×4 · MOCK ×3 · OBSOLETO ×3 · AUSENTE ×0 · NO VERIFICABLE ×0.

## 5. No verificables (en modo solo-lectura)

- **NFR-016 (≤300 KB gz de arranque):** el lazy+chunking ya está; no se midió el gzip real de arranque
  (requeriría `build`/análisis). Arquitectura habilitada, meta **no confirmada**.
- **NFR-017 (a11y AA):** fuera de alcance de esta parte (auditoría axe dedicada); no medido aquí.
- **`pages/Integrations/` (7 sub-componentes):** existen (`ConnectionsManager`, `SyncLogsViewer`, `WebhookEventsViewer`,
  `FieldMappingConfig`, …); no se confirmó qué hub los monta ni si están todos cableados → **NO VERIFICABLE** sin traza runtime.
- **Cobertura real de API por página** (las ~20 top-level sin `api.*` directo): varias delegan en `services/*`
  o son shells/hub finos (`Flowbuilder` 2.2 KB, `CampaignsContacts` 1.5 KB, `QueueIntegrations` 1.5 KB); su
  operatividad efectiva depende del hijo/servicio, no verificable estáticamente al 100%.

## 6. Resumen ejecutivo (<200 palabras)

El frontend (172 páginas, 120 componentes) está **mayormente cableado a API real** (~145/165 páginas) y con
enrutado limpio (161 módulos, 159 `lazy()`). Dos afirmaciones del SPEC quedan **desactualizadas**: (a) el bundle
ya migró a **lazy por ruta + manualChunks** (el "103 eager/703 KB gz" vive en `App.tsx.bak_lazy`), y (b) las
**modales de FlowBuilder no están vacías** (12 `index.jsx` de 5–50 KB). La hipótesis del envelope se **refuta**:
no hay tipo `{success,data}`; el front lee plano o defiende con `||`/`??` (riesgo = contrato **no tipado**, no
sobre-asunción). Se **confirma** el P0 de 5 `fetch()` crudos sin baseURL/token, pero **todos** en
`WhatsAppCampaigns.tsx`, que es **huérfana** (inalcanzable por UI). Deuda de diseño **peor que lo declarado**:
además de Joy+Material hay un **tercer sistema** Tailwind/shadcn en 168 páginas. i18n casi inexistente (4 páginas
vía singleton legacy; 0 `useTranslation`). **Zonas MOCK reales:** `Leads`, `AppointmentsReports` y todo el módulo
"Integraciones Internas" (Billie/SGR/SmartTrack/AriaLite) renderizan datos hardcodeados.

**Conteo:** EXISTE 4 · PARCIAL 4 · MOCK 3 · OBSOLETO 3 · AUSENTE 0 · NO VERIFICABLE 0 (+4 ítems en §5).
