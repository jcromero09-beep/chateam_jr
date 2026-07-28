# Autenticación de webhooks entrantes

> **Fecha**: 2026-07-28
> **Ámbito**: los cuatro endpoints públicos que aceptan tráfico de terceros
> (Meta, CoinGate, MercadoPago) y no pasan por `isAuth`.

Un webhook sin verificar es una API de escritura anónima. Este documento
registra cómo quedó cada uno y **qué hay que configurar para que funcionen**.

---

## Resumen

| Endpoint | Antes | Ahora |
|----------|-------|-------|
| `POST /webhook` (mensajería y comentarios FB/IG) | **sin ninguna verificación** | HMAC `X-Hub-Signature-256` |
| `POST /webhook/metaws` (WhatsApp Cloud API) | HMAC en modo `warn` (aceptaba firmas inválidas) | HMAC en modo `enforce` |
| `POST /webhook/facebook` (comentarios de páginas) | HMAC, pero **sin `rawBody`** → siempre `no_raw_body` | HMAC operativo (`rawBody` capturado) |
| `POST /ai/coingate/webhook` | confiaba en el body (`status`, `price_amount`) | token de callback + **re-lectura desde la API** |
| `POST /ai/mercadopago/webhook` | sin firma | HMAC `x-signature` |

---

## Variables de entorno

### Obligatorias si usás Meta (WhatsApp Cloud, páginas FB/IG)

| Variable | Notas |
|----------|-------|
| `FACEBOOK_APP_SECRET` | Clave del HMAC. **Sin esto, en `enforce` se rechaza el 100% del tráfico de Meta.** |
| `VERIFY_TOKEN` | Token del handshake `hub.verify_token`. Ya no hay default: antes caía a `"whaticket"`, el literal público del proyecto upstream. |
| `FACEBOOK_VERIFY_TOKEN` | Opcional; si falta, `/webhook/facebook` usa `VERIFY_TOKEN`. |
| `META_SIGNATURE_MODE` | `enforce` (default) · `warn` · `off`. |

`META_SIGNATURE_MODE=warn` sigue existiendo como escotilla de rollout, pero es
una decisión explícita que hay que escribir en el entorno. Al arrancar, el
backend loguea un `warn` si no está en `enforce`, y un `error` si está en
`enforce` sin `FACEBOOK_APP_SECRET` (ver `assertMetaSignatureConfig`).

### Obligatorias si usás CoinGate

| Variable | Notas |
|----------|-------|
| `COINGATE_CALLBACK_TOKEN` | Secreto aleatorio. Se añade como `?token=` a la `callback_url` que se registra al crear la orden y se valida en tiempo constante al recibir el callback. Sin él, los callbacks se rechazan con 503. |

CoinGate **no firma** sus callbacks — la API v2 no manda ningún header HMAC. Su
recomendación oficial es token en la URL + lista blanca de IPs. Por eso la
defensa principal no es el token sino que `processWebhook` **relee la orden
desde la API de CoinGate**: del body solo se usa el `id`. El `status` y el
importe que venga en el cuerpo se ignoran (y si difieren de la API, se loguea).

### Obligatorias si usás MercadoPago

| Variable | Notas |
|----------|-------|
| `MERCADOPAGO_WEBHOOK_SECRET` | Clave secreta del panel (Tus integraciones → Webhooks). Sin ella se rechazan los webhooks con 503. |
| `MERCADOPAGO_WEBHOOK_TOLERANCE_SEC` | Ventana anti-replay en segundos. Default `600`; `0` la desactiva. |

Manifiesto firmado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
(omitiendo los campos ausentes, `id` en minúsculas), HMAC-SHA256 en hexadecimal
contra el `v1` del header `x-signature: ts=...,v1=...`.

---

## Trampa conocida: `rawBody`

La validación HMAC de Meta necesita el cuerpo **sin parsear**. `app.ts` solo lo
guarda para una lista blanca de rutas (`RAW_BODY_PATHS` + la raíz `/webhook`).

**Si añadís un webhook que valide firma y no lo agregás a esa lista**, el
validador devolverá `no_raw_body` y, en `enforce`, rechazará todo el tráfico —
que fue exactamente el estado en el que estaba `/webhook/facebook`.

---

## Qué NO cubre esto

- **Sin lista blanca de IPs.** Ni para CoinGate ni para Meta. La firma es la
  defensa; la IP sería defensa en profundidad.
- **Sin idempotencia.** Ningún webhook desduplica por id de evento. Hoy no
  importa porque ninguno muta saldos, pero es requisito antes de conectarlos a
  acreditación de créditos.
- **`processWebhook` de MercadoPago y CoinGate no acreditan nada todavía**: solo
  registran y devuelven el pago. La verificación se añadió *antes* de que
  muevan dinero, no después.
