# W1-SEC-02 / P0-E — Análisis de `/public` (media sin auth) — decisión de diseño pendiente

> 2026-07-26 · Mapeo read-only previo a implementar. **No aplicado.** Requiere decisión de JC sobre el
> enfoque; el naive "auth en la ruta" rompe el renderizado de imágenes.

## Hechos verificados
- **Servido estático sin auth:** `app.ts:136-155` → `express.static(uploadConfig.directory)` con un
  middleware de `Content-Disposition` para `?download`. Sin `isAuth` ni scope de tenant. `express.static`
  **no** lista directorios (sin autoindex).
- **`mediaRoutes.ts` (sin montar)** NO sirve estáticos: es una API de upload (`/upload-url`,
  `/:id/confirm`) con `tenantMiddleware`. No es reemplazo directo.
- **Formato de la URL:** `Messages.mediaUrl` guarda **solo el filename** (14.255 filas; 0 absolutas, 0
  `/public`). La URL completa es `<origin>/be/public/company{N}/{filename}`. Hay un getter
  `Message.mediaUrlWithBaseUrl` que usa `BACKEND_URL` — **obsoleto** (`appro.chateam.ws`), así que el
  front construye la URL desde el filename con su propio origen.
- **Blast radius front:** media renderizada en ~10 componentes (`Messages/MessageContent.tsx`,
  `QuotedMessage.tsx`, etc.) como `<img>/<video>`.

## El bloqueante de diseño
Una `<img src="…/be/public/company8/foto.jpg">` **no envía `Authorization: Bearer`**. Por tanto, poner
`/public` detrás de auth Bearer (como las rutas API) **rompería TODA la media** de la app. Cerrar P0-E
sin romper imágenes exige uno de estos enfoques:

| Opción | Cómo | Pros | Contras |
|---|---|---|---|
| **A · URLs firmadas (HMAC, recomendado)** | El backend firma cada URL de media (`?exp=…&sig=…`) al serializar mensajes; el handler de `/public` verifica firma+expiración+companyId antes de servir | Estándar; `<img>` funciona; sin cookies; scope real de tenant | Toca los puntos de serialización de mensajes (varios) + el handler estático; front usa la URL firmada tal cual (o rebuild si la construye él) |
| **B · Cookie httpOnly de sesión** | Login setea cookie; `/public` valida cookie+companyId | `<img>` la envía sola | La app usa Bearer/localStorage, no cookies → cambio de modelo de auth + CSRF a considerar |
| **C · Proxy autenticado** | El front hace `fetch` con Bearer y convierte a blob | Reusa auth actual | Reescritura grande del front (10+ componentes); pierde caché de `<img>`; peor UX |

**Recomendación: Opción A (URLs firmadas).** Es la estándar y la de menor fricción de UX, pero es un
cambio coordinado FE+BE + rebuild, talla **L**, con su propio spec y ventana — **no** un fix quirúrgico
como P0-A..D.

## Riesgo residual actual (mientras P0-E no se aplica)
- Media accesible sin auth por URL directa. **Mitigado en parte** por: (a) `express.static` no lista
  directorios; (b) filenames basados en epoch (no triviales de enumerar); (c) los IDOR que filtraban
  filenames de otros tenants (LogTickets, tickets, socket) **ya se cerraron** en P0-A..D, reduciendo de
  dónde un atacante obtendría filenames ajenos. El residual real: quien **conozca** un filename+companyId
  puede descargarlo sin sesión.

## Hallazgo del mapeo de front (2026-07-26) — reordena A vs B
El front construye la URL de media en **~8 sitios dispersos** (no centralizado):
`pages/Tickets.tsx:2481,3599,3613`, `components/ImageGenerationHistory.tsx:271`,
`components/VideoGenerationHistory.tsx:268`, 4 modales `FlowBuilderAdd*Modal`, `pages/InternalChats.tsx`,
`pages/Profile.tsx` — cada uno arma `${base}/public/company{id}/{filename}`.

Consecuencia:
- **Opción A (URLs firmadas)** ahora es más grande de lo asumido: hay que cambiar los ~8 sitios para
  usar la URL firmada que devuelva el backend + firmar en todos los serializadores + rebuild. Talla
  L/XL. Ventaja: **agnóstica al despliegue** (sirve con FE/BE en dominios distintos).
- **Opción B (cookie httpOnly)** es **backend-only** en el despliegue actual (padeldev = mismo origen):
  Set-Cookie firmada en login + middleware en `/public` que valida cookie + `company{N}` del path. La
  `<img>` manda la cookie sola (mismo origen) → **cero cambios de front, sin rebuild, sin secreto
  nuevo**. Talla S/M. Limitación: **solo mismo origen** (se rompe si FE/BE se separan a dominios
  distintos, como el legado chat/appro.chateam.ws). CSRF: mínimo (cookie solo para GET de media).

**Recomendación actualizada:** en el despliegue actual, **Opción B** (menor, más segura, sin rebuild).
Elegir **A** solo si se planea volver a separar FE/BE en dominios distintos. **Decisión de JC.**

## Recomendación de proceso
Tratar P0-E como tarea propia con **spec de diseño** (Opción A) + ventana de build, no aplicarla al vuelo.
Los otros 4 P0 ya están cerrados y verificados. Buen momento para **versar a git** el trabajo aplicado
como punto de retorno antes de abrir P0-E.
