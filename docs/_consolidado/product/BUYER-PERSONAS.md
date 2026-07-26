# BUYER-PERSONAS — chateam_jr

> Fase 1 Spec-Driven · Actores del sistema y perfiles de comprador · 2026-07-23.
> **Distinción crítica:** los **actores/roles** (§1) están verificados en código; los **perfiles de
> comprador** (§2) son **HIPÓTESIS** de negocio — la doc declara explícitamente que no hay
> posicionamiento de mercado ni buyer-persona confirmados en código (`SPEC.md:36`,
> `01-vision-y-alcance.md:37-39`). No se presenta ninguna hipótesis como hecho.

---

## 1. Actores del sistema (verificado en código)

Multi-tenant: cada empresa (**tenant**, `companyId`) tiene sus usuarios, roles, planes, datos y
límites aislados (`CHATEAM.md:66-68`).

### 1.1 Modelo de roles — estado real (DEUDA declarada)

El rol vive hoy en `Users.profile` (string libre, `models/User.ts:56`) + flag `Users.super`
(`User.ts:75`). **El gating real de menú/ruta no es por rol sino por PLAN** de la company
(`interfacePermissions`) — `SPEC.md:53-59`. En la práctica admin/supervisor/user tienen casi el
mismo techo salvo diferencias de plan (`roles-usuarios-spec.md:23`: en la práctica sólo se usan
`"admin"` e implícito `"user"`).

**Modelo nuevo en migración** (NOMBRE en código, coexiste con el legacy): `models/Role.ts` con slugs
`super_admin | company_admin | supervisor | agent | marketing` + flag `unrestricted`; `Users.roleId`
FK nullable (`Role.ts:42-57`, `User.ts:125-131`). Migración propuesta `admin→company_admin`,
`user→agent` (`roles-usuarios-spec.md:57-58`). → **FR-024**.

### 1.2 Los 4 actores autenticados (`SPEC.md:61-66`, `01-vision-y-alcance.md:63-68`)

| Actor | Identificación | Qué hace | Pantallas principales |
|---|---|---|---|
| **Super-admin** | `super===true` | Gestiona TODAS las companies/planes; configura IA global; ve costos/rentabilidad; administra permisos por plan | `/companies`, `/plans`, `/permissions-manager`, `/admin/ai-token-usage`, `/ai-rentability`, `/ugc/settings` |
| **Admin** (company) | `profile` contiene "admin" | Gestiona usuarios/colas/canales/campañas de **su** company; dashboard admin de IA | Dashboard, Tickets, Kanban, Conexiones, Campañas, Config, Usuarios, Facturación |
| **Supervisor** | `profile`=supervisor | Supervisa tickets/agentes; reportes; mueve leads en Kanban | Tickets, Funnel, Citas, Reportes |
| **User / agente** | default | Atiende tickets/chats asignados; mensajes rápidos; agenda citas | Tickets, Contactos, Mensajes Rápidos, Chats Internos, Citas |

### 1.3 Actor no autenticado

**Visitante del widget WebChat público** (sin login): `POST /webchat/public/message`
(`SPEC.md:68`, `webchat-spec.md:14`). → **FR-010**.

### 1.4 Pendiente de negocio

**[SUPUESTO]** ¿Hace falta un 5º rol (ej. «facturación», «cliente con portal propio»)? El mecanismo
natural sería un flag de plan, sin tocar el enum de `profile` (`SPEC.md:69-70`). → decide JC.

---

## 2. Perfiles de comprador (HIPÓTESIS — pendiente de validación de JC)

> Ninguno de estos perfiles está confirmado. Se derivan de (a) la autodescripción de la doc, (b) el
> posicionamiento de competidores comparables y (c) documentos de planificación interna. Se listan
> para que JC los confirme, ajuste o descarte — **no son un hecho de mercado**.

### Persona A — «Agencia de marketing conversacional» [HIPÓTESIS]
- **Quién:** agencia que opera campañas Click-to-WhatsApp y gestiona varios clientes.
- **Por qué chateam:** multi-tenant real + UGC/IA generativa + atribución Meta en un panel; self-host
  ≈0 licencia le mejora el margen. → BR-001, BR-002, FR-017, FR-018.
- **Base:** `CHATEAM.md:21-24` («agencias de marketing… campañas Click-to-WhatsApp»).

### Persona B — «PyME con equipo de atención» [HIPÓTESIS]
- **Quién:** negocio pequeño/mediano que atiende varios canales con un equipo reducido
  (admin + supervisor + agentes).
- **Por qué chateam:** una sola bandeja, roles, IA que ayuda a responder, sin perder trazabilidad
  comercial. → FR-001, FR-020, FR-006.
- **Base:** inferencia explícita de `SPEC.md:31-33` (marcada [SUPUESTO] en la propia fuente).

### Persona C — «Negocio WhatsApp-first LATAM» [HIPÓTESIS]
- **Quién:** comercio/ecommerce cuyo canal principal es WhatsApp, en mercado LATAM.
- **Por qué chateam:** integración WhatsApp dual (Baileys + Cloud API) como diferenciador; mercado
  LATAM señalado como «desatendido». → FR-002.
- **Base:** `PLAN_EVOLUCION_AGENTES_IA.md:49-50`, `AI_AGENT_MARKET_RESEARCH_2026.md:121-124`
  (documento de planificación, no dato de ventas).

### Persona D — «Equipo de soporte / ecommerce» [HIPÓTESIS]
- **Quién:** equipo de customer-support o ecommerce que hoy usaría Chatwoot/Tidio/Wati.
- **Por qué chateam:** team inbox omnicanal + agente IA + campañas, a menor costo.
- **Base:** posicionamiento de competidores comparables (`market_research:65-67,167-186`).

### Señal de realidad (no proyección)
Tenants reales observados hoy: **15 companies activas**; el mayor es **Smarttrack** con 2.714 tickets
(`SPEC.md:225`); `company8` = "chateam", `company48` el de mayor storage (`MULTI-TENANT.md:41-42`).
Esto describe la base instalada, **no** valida un segmento objetivo.

---

## 3. Preguntas abiertas de persona (para JC)

1. ¿Cuál de A–D (o cuál combinación) es el comprador **objetivo** primario? → fija BR-010.
2. ¿Vertical específica (política/electoral aparece en `CHATEAM.md:269-274` como caso de uso de
   moderación) o horizontal?
3. ¿Tamaño de cuenta objetivo (nº de agentes, nº de conexiones, volumen de mensajes)? → dimensiona
   NFR-010/NFR-011.
4. ¿Mercado geográfico (solo Ecuador vs LATAM/Brasil)? → decide NFR-013 (i18n) y BR-011.
