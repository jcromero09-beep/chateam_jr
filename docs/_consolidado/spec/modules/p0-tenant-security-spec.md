# SPEC + ACCEPTANCE — Ola P0 de seguridad/aislamiento (implementable)

> Fase de Implementación · gate de Regla 6 (spec + acceptance ANTES de tocar código) · 2026-07-24.
> **Este documento NO es implementación**: define el comportamiento objetivo y los criterios
> ejecutables de las 5 tareas P0 para poder implementarlas y verificarlas. El código, el backup previo
> y cualquier reinicio de `chateam-node` requieren **go explícito por tarea** (Reglas 8 y 9).
> Origen: `docs/_consolidado/plan/PLAN-PRELIMINAR.md` + `audit/inv/*` + `audit/SEGURIDAD_MODELO_AMENAZAS.md`.

## Prerequisito común (bloquea a TODAS las P0 SENSIBLES)
- **W0-GATE-01 · Backup verificado** debe existir y su restore probado ANTES de aplicar cualquier P0
  SENSIBLE (W1-SEC-01/02/12, W5-API-04). W1-SEC-03 (REVERSIBLE, one-liner) puede ir sin backup pero
  igual exige go explícito por el reinicio del proceso.
- **Invariantes de toda la ola:** cero regresión de aislamiento (I-G1); no romper el ciclo de sesión ni
  los webhooks ya firmados (I-G3); `scripts/ci-gate.sh` verde tras cada tarea (I-G2).
- **Nota de despliegue:** `chateam-node` corre `server-distributed.ts` bajo PM2; aplicar un cambio de
  código exige `pm2 restart chateam-node` → breve corte + re-init de sesiones. Cada aplicación se hace
  en ventana acordada, una tarea a la vez (Regla 7).

---

## P0-A · W1-SEC-03 — IDOR de lectura en `LogTickets`
- **Spec objetivo:** `GET /tickets-log/:ticketId` (`ShowLogTicketService`) devuelve los logs **solo** si
  el ticket pertenece a la company del solicitante; para un `ticketId` de otra empresa devuelve vacío o
  404, nunca filas.
- **Gap:** `services/TicketServices/ShowLogTicketService.ts:15-18` hace `where:{ticketId}` e ignora el
  `companyId` que recibe. Fix: `include: [{ model: Ticket, required: true, where: { companyId },
  attributes: [] }]`.
- **Clase:** REVERSIBLE · Talla S · sin backup (rollback = revertir include).
- **Acceptance (binario):**
  - AC1: con token de company A y `ticketId` de company B → respuesta **sin filas** (o 404).
  - AC2: con `ticketId` propio → logs intactos (mismo contenido que antes del fix).
  - AC3: `ci-gate.sh` verde.
- **Pruebas:** sonda autenticada A→ticket B (esperar vacío/404) + A→ticket A (esperar igual). Sin datos
  destruidos (solo lectura).
- **Rollback:** revertir el `include` (1 línea).

## P0-B · W1-SEC-12 — Borrado destructivo cross-tenant `DELETE /tickets/:ticketId`
- **Spec objetivo:** `DELETE /tickets/:ticketId` solo borra si el ticket es de la company del
  solicitante; ticket de otra empresa → 404, **sin** destruir nada.
- **Gap:** `TicketController.ts:389` tiene el guard `ShowTicketService(ticketId, companyId)`
  **comentado**; `DeleteTicketService.ts:5-14` hace `Ticket.findOne({where:{id}})` + `destroy()`
  (CASCADE a Messages 79k / LogTickets 225k). Fix: (a) restaurar el guard **o** (b) `where:{id,
  companyId}` en el service (preferible ambos — defensa en profundidad).
- **Clase:** SENSIBLE (destructivo/datos) · Talla S/M · **requiere W0-GATE-01**.
- **Acceptance (binario):**
  - AC1: A intenta `DELETE` de un ticket de B → **404** y el ticket de B **sigue existiendo** (verificar
    en BD conteo antes/después == igual).
  - AC2: A borra un ticket propio → se borra correctamente (comportamiento intra-tenant intacto).
  - AC3: el mismo patrón se aplica a los otros 4 DELETE del hallazgo INV-05 (quick-messages,
    announcements, tags, contact-lists/items) — cada uno con su AC cross-tenant=404.
  - AC4: `ci-gate.sh` verde + RBAC smoke sin regresión.
- **Pruebas:** sonda cross-tenant por verbo (autorizada, sobre datos de prueba, **no** sobre tickets
  reales de clientes); conteo en BD antes/después para confirmar no-borrado cross-tenant.
- **Rollback:** revertir por service; backup disponible si algo se borró por error.

## P0-C · W5-API-04 — `/internal/*` accesible desde Internet (H-01, confirmado en vivo)
- **Spec objetivo:** `/internal/*` **no** es alcanzable desde Internet; solo desde los nodos internos
  autorizados. Una petición externa → 403/404. El ruteo inter-nodo legítimo sigue funcionando.
- **Gap:** guard por `req.ip` (`internal.ts:109-116`) anulado porque `trust proxy` no está y nginx
  reenvía `/be/internal/*`. Fix en dos capas: (a) **nginx** bloquea `location /be/internal/` (deny/404);
  (b) **guard** deja de confiar en `req.ip` y usa un **secreto compartido entre nodos** (header con
  token de `INTERNAL_SHARED_SECRET`), fail-closed.
- **Clase:** SENSIBLE (config borde + auth interna) · Talla S · **requiere W0-GATE-01** (config nginx).
- **Acceptance (binario):**
  - AC1: `GET https://padeldev.codigo.plus/be/internal/health` desde fuera → **403/404** (hoy: 200).
  - AC2: llamada inter-nodo legítima (con el secreto) → sigue **200**.
  - AC3: mensajería multi-nodo (envío/estado) no se rompe: enviar un mensaje de prueba y ver ACK.
- **Pruebas:** sonda externa a `/be/internal/health` (esperar 403) + prueba inter-nodo interna (esperar
  200) + flujo de mensaje de prueba.
- **Rollback:** revertir regla nginx + guard (swap inverso).
- **Nota:** requiere definir `INTERNAL_SHARED_SECRET` en `.env` de cada nodo (JC, por el guard de
  `.env`).

## P0-D · W1-SEC-01 — Socket.IO sin autenticar el handshake
- **Spec objetivo:** una conexión Socket.IO exige JWT válido en el handshake; el `companyId` efectivo
  sale del **token**, no del nombre del namespace; `origin` acotado. Suscribirse a un namespace de otra
  company es imposible.
- **Gap:** `libs/socket.ts:125-130` toma companyId del namespace y userId de la query, 0 `io.use`; CORS
  `origin:"*"`. Fix: middleware `io.use`/`nsp.use` que valida JWT (mismo verificador que `isAuth`), cruza
  `companyId` del token vs namespace, y `cors.origin` = FRONTEND_URL.
- **Clase:** SENSIBLE (transporte vivo de mensajes) · Talla M · **requiere W0-GATE-01**.
- **Acceptance (binario):**
  - AC1: WS sin token → conexión rechazada.
  - AC2: WS con token de company A hacia namespace de company B → rechazada.
  - AC3: agente legítimo de A hacia su namespace → conecta y **recibe** mensajes en tiempo real (sin
    regresión del flujo de tickets).
  - AC4: `origin` no permitido → rechazado.
- **Pruebas:** cliente WS con {sin token / token ajeno / token propio}; regresión: abrir la bandeja y
  confirmar recepción en vivo. Vulnerabilidad **high de engine.io** (INV-04) se anota para actualizar la
  dependencia en la misma ventana si es viable.
- **Rollback:** revertir el middleware (swap); el socket vuelve al estado previo.

## P0-E · W1-SEC-02 — `/public` servido sin auth ni scope de tenant
- **Spec objetivo:** la media (`/public/company{N}/…`) se sirve **solo** a usuarios autenticados y con
  scope de su company; media de otra empresa → 403/404; URLs no adivinables.
- **Gap:** `app.ts:136-155` `express.static` directo, sin middleware; nombres por epoch. Fix: ruta
  autenticada que resuelve el archivo verificando propiedad por `companyId` (el `mediaRoutes` con
  `tenantMiddleware` ya existe pero está sin montar); migrar referencias.
- **Clase:** SENSIBLE (acceso a datos + posible rotura de enlaces) · Talla L · **requiere W0-GATE-01**.
- **Acceptance (binario):**
  - AC1: GET de media de company B con sesión de A (o sin sesión) → **403/404**.
  - AC2: GET de media propia con sesión válida → **200** con el archivo.
  - AC3: media legítima ya referenciada en la app sigue cargando (sin 404 masivo) — plan de migración de
    enlaces incluido.
  - AC4: `ci-gate.sh` verde.
- **Pruebas:** sonda cross-tenant a una URL de media de otra company (esperar 403) + carga de media
  propia (esperar 200) + smoke de la bandeja (imágenes de mensajes cargan).
- **Rollback:** re-montar `express.static` (swap) solo si la migración de enlaces no rompe compat;
  backup disponible.

---

## Orden de aplicación sugerido (una por ventana, con go explícito)
1. **W0-GATE-01** (backup verificado) — prerequisito.
2. **P0-A / W1-SEC-03** (menor riesgo, REVERSIBLE, valida el circuito de sonda+gate).
3. **P0-B / W1-SEC-12** (destructivo — máxima prioridad de daño, ya con backup).
4. **P0-C / W5-API-04** (borde nginx + guard).
5. **P0-D / W1-SEC-01** (socket).
6. **P0-E / W1-SEC-02** (media, la más grande).

## Lo que este documento NO hace
No modifica código, no corre el backup, no reinicia servicios, no sondea con datos reales de clientes.
Cada paso de implementación espera **go explícito por tarea** y, salvo P0-A, un **backup verificado**
(W0-GATE-01). Detención aquí.
