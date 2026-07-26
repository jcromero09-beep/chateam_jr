# W0-INV-03 — Estado de claves de seguridad en `.env` (autorizado por JC)

> Ola 0 (INV) · 2026-07-24 · Lectura **autorizada** del `.env`, acotada a claves de seguridad. **No se
> expuso ningún valor de secreto**: para secretos solo se registró presencia (SET/UNSET + longitud);
> para variables de *modo* (no secretas) el valor. Sin escritura.
>
> **CAVEAT CAPITAL:** esto es el `.env` **archivo**. El proceso vivo lo carga por `dotenv`, pero la
> infra la inyecta PM2 y podría diferir. Donde el runtime importa, se cruza con comportamiento
> observado en vivo. La lectura de `/proc/<pid>/environ` está bloqueada por el clasificador.

## Estado observado (archivo)

| Clave | Estado | Lectura de seguridad |
|---|---|---|
| `META_SIGNATURE_MODE` | **no declarada** | Aplica el default del código (`warn`) → SEC-P1-5 **vivo** |
| `FACEBOOK_SIGNATURE_MODE` | **no declarada** | FB webhook sin enforce |
| `FACEBOOK_APP_SECRET` | SET (32) | El secreto existe → pasar a `enforce` es solo un flip de config |
| `FAL_WEBHOOK_VERIFY_SIGNATURE` | **true** | fal.ai verifica firma (control bueno confirmado) |
| `META_DEBUG_HTTP` | **no declarada** | Confirma OFF → el volcado HTTP de Meta no inunda el log |
| `STRIPE_WEBHOOK_SECRET` | SET (38) | Firma Stripe **operativa** (formato `whsec_`) → fix real |
| `PAYPAL_WEBHOOK_ID` | **UNSET** | ⚠ verificación PayPal **no puede correr** → PayPal sin configurar o webhook no funcional |
| `PAYPAL_CLIENT_SECRET` | **UNSET** | idem: PayPal no configurado en este entorno |
| `ENCRYPTION_KEY` | SET (33) | `secretCrypto` (AES-256-GCM) tiene clave → W1-SEC-06 desbloqueada (33 chars: verificar formato) |
| `INTEGRATION_ENCRYPTION_KEY` | **UNSET** | IntegrationConnection (AES-256-CBC) usaría otra clave/fallback |
| `MASTER_KEY` | **UNSET** | referenciada en `config/auth.ts`; posible fallback |
| `FACEBOOK_APP_SECRET` | SET (32) | (arriba) |
| `COMPANY_TOKEN` | **UNSET** | ⚠ **cambia H-06** (ver abajo) |
| `JWT_SECRET` | SET (39) | ≥32 chars → JWT fail-closed confirmado |
| `COINGATE_API_TOKEN` | **UNSET** | Coingate **no configurado** → SEC-P1-4 no es superficie activa |
| `TELEGRAM_WEBHOOK_SECRET` | **UNSET** | Telegram sin secreto (C-06); sin conexiones Telegram en BD → riesgo latente |

## Reclasificaciones derivadas

1. **H-06 (W1-SEC-11): P0 → P2 LATENTE.** `isAuthCompany.ts:20-22` — si `COMPANY_TOKEN` no está,
   lanza y el catch devuelve 403 a **cualquier** token; sin header → 401. Con `COMPANY_TOKEN` UNSET, el
   endpoint `/api/users/:email` **no admite ningún token válido** → la fuga de `passwordHash` es
   **inalcanzable externamente hoy**. El defecto del service (`APIShowEmailUserService` sin excluir
   `passwordHash` ni filtrar `companyId`) sigue siendo un **trap latente**: si algún día se configura
   `COMPANY_TOKEN`, la fuga se activa. Fix defensivo mantiene prioridad **P2**, no P0.
   - Nota funcional: con `COMPANY_TOKEN` unset, **toda** `apiCompanyRoutes` (`/api/users/:email`,
     `/api/companiesEmail/:email`, …) está cerrada → si alguna integración externa la usaba, está rota.
2. **SEC-P1-5 (Meta/FB `warn`): CONFIRMADO vivo** — MODE no declarado → default `warn`; el secreto FB
   está presente, así que `enforce` es un flip. Se mantiene **P1**.
3. **SEC-P1-4 (Coingate forjable): → P3 latente** — `COINGATE_API_TOKEN` unset → Coingate no es
   superficie activa; el code path existe pero no hay integración viva.
4. **PayPal:** `PAYPAL_WEBHOOK_ID`/`PAYPAL_CLIENT_SECRET` unset → la verificación fail-closed que la
   auditoría dio por buena **no puede ejecutarse**; PayPal está **sin configurar** en este entorno. La
   afirmación "Stripe/PayPal firmados" se matiza: **Stripe sí** (secreto presente), **PayPal no
   aplica** (no configurado). No es un agujero — es integración inactiva; verificar con negocio si
   PayPal debe operar.
5. **W1-SEC-06 (cifrar secretos): desbloqueada** — `ENCRYPTION_KEY` presente. Verificar que 33 chars es
   el formato correcto para AES-256-GCM antes de migrar.
6. **META_DEBUG_HTTP off confirmado** — coherente con el fix de logging de Meta ya commiteado.

## Neto sobre P0
De 5 a **4 P0 activos**: Socket.IO (SEC-P0-1), `/public` (SEC-P0-2), LogTickets (SEC-P0-3),
`/internal` (W5-API-04, confirmado en vivo). H-06 baja a P2 latente por `COMPANY_TOKEN` unset.

## Límite
`.env` archivo ≠ runtime garantizado (PM2). Los estados de `COMPANY_TOKEN`, `META_SIGNATURE_MODE` y
`PAYPAL_*` deberían reconfirmarse contra el env del proceso vivo en una ventana con acceso autorizado a
`/proc/<pid>/environ` si se quiere certeza total. Nada de este INV se expuso como valor de secreto.
