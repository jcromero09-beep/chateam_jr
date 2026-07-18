# Frontend (React + Vite) — Inventario & Auditoría (Spec-Driven)

> Proyecto: `chateam_jr` · Ruta: `/home/jcromero09/chateam_jr/frontend`
> Fecha: 2026-07-12 · Alcance: SOLO LECTURA (grep/glob/read)
> Build servido: `dist/` reconstruido con `VITE_API_URL=https://padeldev.codigo.plus/be`

---

## 1. Propósito / Alcance

SPA de la plataforma omnicanal WhatsApp/IA multi-tenant. Sirve la interfaz web en `/`
(reverse-proxy nginx en `padeldev.codigo.plus`), consume el backend bajo prefijo `/be/`
y abre sockets namespaced por `companyId`. Este documento inventaría el frontend
(páginas, componentes, servicios, estado, permisos), describe sus flujos, y lista
hallazgos priorizados P0–P3.

**Stack real** (evidencia `frontend/package.json`):
- React **18.3.1** + React-DOM 18.3.1 (NO React 19).
- Vite **7.1.9** + `@vitejs/plugin-react` 5.0.4.
- **MUI Joy 5.0.0-beta.52** (librería UI primaria) + **MUI Material 7.3.5** + `@mui/icons-material` 7.3.4. Emotion 11.
- react-router-dom **7.9.4**.
- Estado: **NO Redux / NO Zustand / NO Recoil** (0 archivos). Solo React Context (`ThemeContext`) + un hook local `useAuth`.
- socket.io-client 4.8.1 · axios 1.12.2.
- Gráficas: **recharts 3.2.1** Y **chart.js 4.5.1 + react-chartjs-2** (dos librerías).
- Toasts: **react-toastify 11** Y **sonner 2** (dos librerías, ambas montadas).
- Formularios: formik 2.4.9 + yup 1.7.1.
- Flowbuilder: reactflow 11.11.4 · DnD: `@hello-pangea/dnd` 18.
- i18n: i18next 25 (configurado pero **sin uso real**, ver H-13).
- Pagos: `@paypal/react-paypal-js` 8.9.2.
- `package.json` declara `name: jrchateam-frontend`, `version: 6.0.0` (diverge del `chateam-platform v1.1.0` del CONTEXT — dos versionados).

**Conteo de archivos** (`find src`):
- `.tsx` = 269 · `.ts` = 48 · `.jsx` = 16 · `.js` = 3 · **total = 336** archivos fuente.

---

## 2. Inventario (el "qué" — EXHAUSTIVO, con conteos)

### 2.1 Entrada y árbol raíz
`src/` raíz: `App.tsx` (493 líneas), `main.tsx`, `theme.ts`, `vite-env.d.ts`.
- `main.tsx`: monta `BrowserRouter` → `ThemeProvider` → `App` + `<ToastContainer>` (react-toastify). Desregistra service workers previos (`main.tsx:10-17`).
- `App.tsx`: doble provider MUI (`MaterialCssVarsProvider` + Joy `CssVarsProvider`) + `<Toaster>` (sonner) + `<Routes>`.

### 2.2 Páginas y rutas
- **163 archivos** `.tsx` en `src/pages/` + 12 archivos en subdirs `src/pages/FlowBuilder` y `src/pages/Integrations`.
- **163 rutas** `<Route path=...>` en `App.tsx`.
- **103 páginas importadas de forma EAGER** (estáticas) vs **55 lazy** (`lazy(() => import(...))`). Ver H-2 (bundle).
- **4 rutas `superOnly`**: `/permissions-manager`, `/admin/ai-token-usage`, `/ai-rentability`, `/ugc/settings` (`App.tsx:405,416,428,454`).
- Rutas públicas (sin `ProtectedRoute`): `/login`, `/signup`, `/forgot-password`, `/reset-password` (`App.tsx:262-263,481-482`).
- Catch-all `*` → `Navigate to="/"` (`App.tsx:485`).

Grandes dominios de páginas (por prefijo de nombre):
| Dominio | Ejemplos de páginas | # aprox |
|---|---|---|
| IA / OpenAI / AI* | AIPlatform, AIAgents, AIKnowledgeBase, OpenAIDashboard, AIImageGeneration, AIVideoGeneration… | ~40 |
| UGC | UGCDashboard, UGCCampaigns, UGCVideoStudio, UGCGenerate… | 12 |
| Email Marketing | EmailMarketing*, EmailCampaignWizard, EmailTemplatesEditor… | 13 |
| WhatsApp Cloud | WhatsAppDashboard/Numbers/Templates/Webhooks/Analytics/Settings/Tester/Monitor/Campaigns | 9 |
| Appointments | Appointments* (Dashboard/Calendar/Services/…) | 8 |
| Integraciones | Integration Billie/AriaLite/SmartTrack/SGR + Integrations* | ~11 |
| Afiliados | Affiliate* | 9 |
| Campañas | Campaigns*, CampaignAI, CampaignRules | 8 |
| Flowbuilder | Flowbuilder, FlowbuilderCampaign/Conversation/Editor | 4 |
| Operativo core | Tickets, Kanban, FunnelBoard, Contacts, RealtimeChats, InternalChats, Queues, Tags | ~10 |
| Auth | Login, SignUp, ForgotPassword, ResetPassword | 4 |

Archivos muertos/duplicados en `pages/`: `Tickets copy.tsx`, `KanbanOLD.tsx`, `ApiMessages.tsx.bak`, `UGCModelSelector.tsx` (también existe carpeta homónima). Ver H-9.

### 2.3 Componentes
- **92 componentes** `.tsx` bajo `src/components/` (29 archivos en raíz de `components/`).
- Subdominios con contenido: `Messages/` (21 comps de chat: `MessageBubble`, `MediaImage/Video/Document`, `AudioPlayer`, `LocationMessage`, `VCardMessage`, `QuotedMessage`, `CiphertextMessage`, `RoutingPolicySelector`, `TikTokCommentBubble`, `ConversationSearchBar`…), `UGCModelSelector/` (6), `shared/` (5), `CheckoutPage/` (4), `LazyLoad/` (3).
- **11 carpetas `FlowBuilder*Modal/` VACÍAS** (0 archivos): `FlowBuilderAddAudioModal`, `…AddImgModal`, `…AddListModal`, `…AddPdfModal`, `…AddTextModal`, `…AddURLModal`, `…AddVideoModal`, `…IntervalModal`, `…MenuModal`, `…RandomizerModal`, `…SingleBlockModal`. Ver H-10.
- Infra de rutas/layout: `ProtectedRoute.tsx` (65 líneas), `AppLayout.tsx` (**1829 líneas**), `AccessDenied.tsx`.
- Modales de conexión de canales: `WhatsAppModal`, `FacebookModal`, `InstagramModal`, `TelegramModal`, `MetaCloudModal`, `EmbeddedSignupModal`, `UnifiedConnectionModal`.

### 2.4 Servicios (`src/services/`, 17 archivos .ts)
`api.ts` (cliente axios central), `socket.ts` (singleton socket.io), `authService.ts`,
`ticketService.ts`, `appointmentService.ts`, `financialService.ts`, `notificationService.ts`,
`emailCampaignService.ts`, `paymentConfigService.ts`, `paypalService.ts`, `generationService.ts`,
`aiCorrectionReviewService.ts`, `aiImageGenerationApi.ts`, `aiVideoGenerationApi.ts`,
`metaAdsAgentService.ts`, `socialCommentService.ts`, `ugcModelSelectorService.ts`.

### 2.5 Hooks y contexto
- Context: `context/Auth/AuthContext.tsx` (40 líneas, **AuthProvider NUNCA montado** — ver H-1), `context/ThemeContext.tsx`.
- Hooks (14): `useAuth.ts`, `usePermissions.ts`, `usePlanFeatures.ts`, `useChannelUtils.tsx`, `useFilterOptions.ts`, `useInternalChatSocket.ts`, `useMessageFormatting.ts`, `useSocketListeners.ts`, `useTicketActions.ts`, `useTicketCounts.ts`, `useTicketFilters.ts`, `useTicketsList.ts`.
- `utils/permissions.ts` = **1197 líneas** (motor RBAC: `Module`, `ALL_MODULES`, `hasAccessByPlan`, `mapProfileToRole`, `parseInterfacePermissions`).

### 2.6 Build (`dist/`)
- Total `dist/` = **27 MB** · `dist/assets/` = 23 MB.
- Chunk principal `index-CsfnEnr_.js` = **2814.8 KB** (2.75 MB, sin comprimir) — contiene las 103 páginas eager.
- `mui-joy` 434 KB · `charts` 395 KB · `react-vendor` 174 KB · `mui-icons` 137 KB.
- **JS total = 4.6 MB** (sin gzip).
- **112 archivos `.map` = 19 MB de sourcemaps** publicados en producción (ver H-4).
- `VITE_API_URL` correctamente horneado: 13 ocurrencias de `padeldev.codigo.plus/be` en bundle.

---

## 3. Arquitectura & Flujos (el "cómo")

### 3.1 Cliente API (`src/services/api.ts`)
- `baseURL = import.meta.env.VITE_API_URL || ''` (`api.ts:4,15`), `timeout: 30000`, `withCredentials: true`.
- **Request interceptor**: inyecta `Authorization: Bearer <token>` desde `localStorage.getItem('token')` (`api.ts:26-29`); añade header `x-client-type: web` (`api.ts:33-35`); en `FormData` borra Content-Type y sube timeout a 300000 (`api.ts:38-47`); logs solo si `VITE_DEBUG === 'true'`.
- **Response interceptor**: manejo de refresh token con cola (`failedQueue`), refresh vía `POST /api/auth/refresh_token` con cookie HTTPOnly `jrt` (`api.ts:169-198`); on 401 no-auth → intenta refresh, si falla limpia `token/refreshToken/sid` de localStorage y redirige a `/login` (`api.ts:199-218`); maneja `session_revoked` (login en otro dispositivo, `api.ts:135-147`); toasts para 403/404/429/5xx (`api.ts:224-237`).

### 3.2 Autenticación (`authService.ts` + `hooks/useAuth.ts`)
- **Token JWT en `localStorage` bajo clave `token`** (`authService.ts:41`); `sid` en localStorage; refresh token web NO en JS (cookie HTTPOnly `jrt`).
- `login` → `POST /api/auth/login {email,password,clientType:'web'}` (`authService.ts:32-37`).
- `useAuth()` es un **hook con `useState` local** (no context): al montar valida token (`/api/auth/validate`) y trae usuario (`/api/auth/me`) (`useAuth.ts:64-88`); conecta socket cuando hay `user.id + companyId` (`useAuth.ts:91-100`). **32 componentes** importan este hook → cada uno tiene su propia copia de estado (ver H-1).

### 3.3 Socket.IO (`src/services/socket.ts`)
- Singleton `SocketService`. Deriva el **origin** de `VITE_API_URL` (descarta el prefijo `/be`) y conecta al **namespace `/${companyId}`** (`socket.ts:36-51`), con `query.userId`, `transports: ['websocket','polling']`, reconexión infinita.
- **`socket.onAny` logea TODOS los eventos entrantes por consola** (`socket.ts:66-68`) → ruido y fuga de datos en prod (ver H-3).

### 3.4 Perfiles/roles y gating (RBAC)
- Perfiles: `super` (bandera `user.super === true`), `admin`, `supervisor`, `user`.
- `usePermissions()` (`hooks/usePermissions.ts`): superadmin (super===true) tiene acceso total; el resto deriva permisos del **plan de la empresa** (`user.company.plan.interfacePermissions` JSON) vía `parseInterfacePermissions`/`hasAccessByPlan`. Los roles legacy (admin/supervisor/user) se mantienen por compatibilidad pero el gate real es por PLAN, no por rol.
- **Gating de rutas**: `ProtectedRoute` verifica `isAuthenticated` (si no → `/login`), luego `superOnly` (→ `AccessDenied`) y `module` vía `canAccess()` (→ `AccessDenied`), y envuelve en `AppLayout` (`ProtectedRoute.tsx:29-64`).
- **Gating de menú**: `AppLayout.tsx:1184-1190` filtra ítems por `item.roles.includes('super') && user?.super` y por `canAccess(item.module)`. Coherente con las rutas.

### 3.5 Flujos clave
- **Login**: `Login.tsx` → `useAuth().login` → guarda `token` en localStorage → estado local. (Depende de re-init en navegación por H-1.)
- **Tickets/chat**: `Tickets.tsx` (archivo muy grande, refs hasta línea ~4100) + hooks `useTicketsList/useTicketActions/useTicketFilters/useTicketCounts` + `useSocketListeners` + 21 componentes `Messages/`. Media servida desde `${BACKEND_URL}/public/company{companyId}/...` (`Tickets.tsx:2470,4087,4101`).
- **Campañas**: `Campaigns.tsx` + subpáginas; `WhatsAppCampaigns.tsx` usa `fetch()` crudo (roto, ver H-0).
- **Flowbuilder**: `Flowbuilder.tsx` + `FlowbuilderEditor` (reactflow), ruta `/flowbuilder/editor/:flowId`.
- **UGC/IA**: 12 páginas UGC + ~40 IA, todas lazy.
- **Kanban/Funnel**: `/funnel` (Kanban), `/kanban` redirige a `/funnel`, `/kanban-dashboard` lazy.

---

## 4. Hallazgos (SEVERIDAD P0–P3)

### P0 — Crítico

**H-0 · `fetch()` crudo sin baseURL ni token en WhatsAppCampaigns (módulo roto).**
`src/pages/WhatsAppCampaigns.tsx:128,135,142,149,219` usan `fetch('/campaigns')`, `fetch('/whatsapp')`, `fetch('/contact-lists')`, `fetch('/whatsapp-templates?...')` y `fetch('/campaigns', {POST})` **sin pasar por el cliente `api` de axios**. Consecuencias en producción:
1. Van al **origin de la SPA** (`https://padeldev.codigo.plus/campaigns`), NO al backend bajo `/be` → 404 / HTML del index (`Unexpected token '<'` al hacer `.json()`).
2. **No llevan `Authorization: Bearer`** → aunque existieran, serían 401.
Es el único módulo con `fetch` directo (5/5 ocurrencias en este archivo). Debe migrarse a `api.get/post`.

### P1 — Alto

**H-1 · `useAuth` no es contexto: estado de auth duplicado en 32 componentes.**
`AuthContext.tsx` define `AuthProvider`, pero **nunca se monta** (`main.tsx` solo envuelve `ThemeProvider`; grep de `AuthProvider` solo aparece en su propia definición). Los **32 archivos** que hacen `import { useAuth } from '../hooks/useAuth'` instancian un hook con `useState` **local e independiente** (`useAuth.ts:52-56`). Efectos:
- Cada montaje re-ejecuta `initAuth()` → llamadas repetidas a `/api/auth/validate` + `/api/auth/me` (`useAuth.ts:64-88`).
- El `login()` en `Login.tsx` NO propaga a `AppLayout`/otros; solo "funciona" por re-init al navegar (frágil).
- `AuthContext.useAuth` devuelve `undefined` si no hay provider (`AuthContext.tsx:35`) → mezcla de dos APIs `useAuth` (hooks vs context) confusa. Consolidar en un único `AuthProvider` real.

**H-2 · Bundle monolítico de 2.75 MB; 103 páginas cargadas eager.**
`dist/assets/index-CsfnEnr_.js` = **2814.8 KB** sin comprimir. `App.tsx` importa **103 páginas de forma estática** vs solo 55 lazy. Todo el core (Tickets, Campañas, Email, WhatsApp, Appointments, Integraciones…) entra en el chunk inicial → LCP/TTI degradados en el primer render (login incluido). Además `manualChunks` (`vite.config.ts:46-51`) solo separa `recharts`, no `chart.js`, que cae en el chunk principal. Recomendación: `lazy()` para todas las páginas + revisar chunking.

**H-3 · `socket.onAny` logea todos los eventos en producción (fuga de datos + ruido).**
`socket.ts:66-68`: `this.socket.onAny((eventName, ...args) => console.log('Socket event received', ...))`. En prod imprime en consola cada mensaje/ticket/evento entrante (PII de conversaciones). Debe condicionarse a `VITE_DEBUG` o eliminarse.

### P2 — Medio

**H-4 · Sourcemaps de producción publicados (19 MB, código fuente expuesto).**
`vite.config.ts:43` `sourcemap: true`. `dist/` contiene **112 `.map` (19 MB)** servidos por nginx → cualquiera reconstruye el TS original (lógica de negocio/permisos). Poner `sourcemap: false` en build de prod (o `hidden`).

**H-5 · 206 `console.log` (621 `console.*` totales) en el código fuente.**
`grep console.*` = 621; solo `console.log` = 206. Incluyen logs de refresh token (`api.ts:170,184`), socket (`socket.ts:41,54,58,62`), "Service worker unregistered" (`main.tsx:14`). Ruido en consola de prod y posible filtración. Introducir logger con nivel o strip en build.

**H-6 · Dos librerías de toasts montadas simultáneamente.**
react-toastify (`<ToastContainer>` en `main.tsx:24`, usado en **91 archivos** incl. `api.ts`) Y sonner (`<Toaster>` en `App.tsx:258`, usado en 26 archivos). Doble sistema de notificaciones → UX inconsistente (dos estilos/posiciones) y peso extra. Unificar en una.

**H-7 · Dos librerías de gráficas empaquetadas.**
recharts (13 archivos) + chart.js/react-chartjs-2 (1 archivo: baja adopción). El chunk `charts` pesa 395 KB. Migrar el único consumidor de chart.js a recharts y eliminar `chart.js`+`react-chartjs-2`.

**H-8 · MUI Joy (beta) como UI primaria + Material v7 en paralelo.**
265 archivos importan `@mui/joy` (5.0.0-**beta**.52), 6 importan `@mui/material` (v7), y 2 archivos mezclan ambos (`App.tsx`, `Messages/RoutingPolicySelector.tsx`). Joy sigue en beta (riesgo de breaking changes) y se cargan dos runtimes de theming (doble `CssVarsProvider`). No hay MUI v4 (`@material-ui` = 0, correcto). Definir estrategia: consolidar en Material v7 o fijar Joy.

### P3 — Bajo

**H-9 · Archivos muertos/duplicados en el árbol fuente.**
`pages/Tickets copy.tsx`, `pages/KanbanOLD.tsx`, `pages/ApiMessages.tsx.bak`, `components/TagModal/index.jsx.bak`. Incrementan superficie y confunden. Eliminar.

**H-10 · 11 carpetas `FlowBuilder*Modal/` vacías.**
`components/FlowBuilderAdd{Audio,Img,List,Pdf,Text,URL,Video}Modal`, `…{Interval,Menu,Randomizer,SingleBlock}Modal` sin archivos. Andamiaje abandonado; limpiar.

**H-11 · URLs hardcodeadas de fallback obsoletas.**
Fallbacks a `https://appro.chateam.ws` cuando falta env: `Tickets.tsx:107`, `CommentAutoReplySettings.tsx:38`, `WebChatSettings.tsx:357`. `socket.ts:36` cae a `http://localhost:3000`. Datos mock con `https://api.jrchateam.com/...` en `IntegrationsWebhooks.tsx`, `IntegrationBillie.tsx`, etc. (son placeholders de UI, no llamadas reales). Centralizar base URLs y remover fallbacks a dominios ajenos.

**H-12 · `process.env` shimmeado en Vite.**
`vite.config.ts:8-10` define `'process.env': {}`. Antipatrón en Vite (debería usarse `import.meta.env`); puede enmascarar variables y romper libs que leen `process.env`.

**H-13 · i18next configurado pero sin uso (dead scaffolding).**
`i18next`+`i18next-browser-languagedetector` en deps y `src/translate/i18n.js`, pero **0 páginas** usan `useTranslation` (grep en `src/pages`). Toda la UI tiene strings en español hardcodeados. O se adopta i18n o se elimina la dependencia.

**H-14 · Sin configuración de ESLint pese a script `lint`.**
`package.json` define `lint: eslint . --ext ts,tsx …` pero no existe `.eslintrc*` ni `eslint.config.js` en `frontend/`. El script fallaría; no hay linting real en CI local. `tsconfig.json` sí tiene `strict: true` (bien), pero faltan `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` y hay **466** usos de `any` (`: any`/`as any`/`<any>`).

**H-15 · Proxy de dev apunta a `localhost:4000`, backend documentado en `:3010`.**
`vite.config.ts:24,29` proxy → `http://localhost:4000`; el CONTEXT indica backend local en `127.0.0.1:3010`. Solo afecta `vite dev` (no prod), pero desincroniza el DX.

---

## 5. Recomendaciones (priorizadas)

1. **[P0] Arreglar `WhatsAppCampaigns.tsx`**: reemplazar los 5 `fetch()` por `api.get/post` (H-0).
2. **[P1] Montar un `AuthProvider` real** en `main.tsx` y que los 32 componentes consuman el contexto, no el hook local (H-1).
3. **[P1] Convertir todas las páginas a `lazy()`** y afinar `manualChunks` (incluir chart lib, dividir MUI) para bajar el chunk inicial de 2.75 MB (H-2).
4. **[P1/P2] Endurecer prod**: quitar `socket.onAny` (H-3), `sourcemap:false` (H-4), strip de `console.*` (H-5).
5. **[P2] Deduplicar librerías**: un solo sistema de toasts (H-6) y una sola de gráficas (H-7); decidir Joy vs Material (H-8).
6. **[P3] Higiene**: borrar archivos `*.bak/copy/OLD` (H-9) y carpetas vacías (H-10); centralizar base URLs (H-11); quitar shim `process.env` (H-12); resolver i18n (H-13); añadir `eslint.config.js` (H-14); alinear proxy dev (H-15).

---

## 6. Evidencia (archivo:línea, comandos, salidas)

Comandos ejecutados (en `frontend/`):
```
find src -name '*.tsx'|wc -l → 269 ; *.ts → 48 ; *.jsx → 16 ; *.js → 3 (total 336)
grep -rn "console\." src → 621 ; console.log → 206
grep -rn "\bfetch(" src → 5 (todas en WhatsAppCampaigns.tsx)
grep -rn "@material-ui" src → 0 ; @mui/joy files → 265 ; @mui/material files → 6 ; mezclan ambos → 2
grep -rln "redux|zustand|recoil|mobx|jotai" src → 0
grep -rln "react-toastify" src → 91 ; "sonner" → 26
recharts files → 13 ; chart.js/react-chartjs-2 → 1
grep -rln "useAuth" src/**.tsx → 32 ; grep AuthProvider → solo su definición
grep -c "<Route path=" App.tsx → 163 ; superOnly → 4
find src/pages -maxdepth 1 -name '*.tsx'|wc -l → 163
find src/components -name '*.tsx'|wc -l → 92
du -sh dist → 27M ; dist/assets → 23M
find dist -name '*.map'|wc -l → 112 (19M)
find dist -name '*.js' Σ → 4.6 MB ; index chunk 2814.8 KB
grep -rho "padeldev.codigo.plus/be" dist/assets/*.js → 13
useTranslation en src/pages → 0
grep ": any|as any|<any>" src → 466
```

Referencias de código:
- Cliente API/token: `src/services/api.ts:4,15,26-29,33-35,169-218,224-237`.
- Auth: `src/services/authService.ts:32-52,109-119`; `src/hooks/useAuth.ts:52-100`.
- Context no montado: `src/context/Auth/AuthContext.tsx:20-38`; `src/main.tsx:19-38`.
- Permisos/RBAC: `src/hooks/usePermissions.ts:31-124`; `src/utils/permissions.ts` (1197 líneas); `src/components/ProtectedRoute.tsx:29-64`; `src/components/AppLayout.tsx:174,1184-1190`.
- Socket + onAny: `src/services/socket.ts:36-51,66-68`.
- Rutas: `src/App.tsx:255-490` (163 rutas; eager 103 / lazy 55; superOnly 405,416,428,454).
- `fetch()` crudo: `src/pages/WhatsAppCampaigns.tsx:128,135,142,149,219`.
- Build/chunks/sourcemaps: `vite.config.ts:8-10,24,29,43,46-51`.
- Fallbacks URL: `src/pages/Tickets.tsx:107`; `src/pages/CommentAutoReplySettings.tsx:38`; `src/pages/WebChatSettings.tsx:357`; `src/services/socket.ts:36`.
- Archivos muertos: `pages/Tickets copy.tsx`, `pages/KanbanOLD.tsx`, `pages/ApiMessages.tsx.bak`, `components/TagModal/index.jsx.bak`.
