# SPEC + ACCEPTANCE — P0-E / W1-SEC-02 · Media por URLs firmadas (Opción A)

> Fase de Implementación · spec de diseño (gate Regla 6) · 2026-07-26. Define el objetivo y los
> criterios de la remediación de `/public` (media sin auth). **No es implementación.** Talla L,
> coordinada FE+BE + rebuild + ventana. Origen: `audit/inv/W1-SEC-02-analisis.md`,
> `audit/SEGURIDAD_MODELO_AMENAZAS.md` SEC-P0-2.

## Problema
`app.ts:136-155` sirve `/public` con `express.static` sin auth ni scope de tenant → media
descargable cross-tenant por URL directa. Una `<img>` no envía `Authorization: Bearer`, así que auth
Bearer directa rompería toda la media. `Messages.mediaUrl` guarda solo el **filename**; la URL
`…/be/public/company{N}/{file}` la arma el front.

## Objetivo
La media se sirve **solo** vía URL firmada (HMAC, con expiración) ligada a `companyId`; una URL sin
firma, expirada, con firma inválida o de otra empresa → **403/404**. Las `<img>/<video>` siguen
funcionando (sin Bearer).

## Diseño (Opción A — URLs firmadas)
1. **Esquema de firma:** `/public/company{N}/{ruta}?exp={epoch}&sig={hmac}` donde
   `sig = HMAC-SHA256(MEDIA_SIGNING_SECRET, "company{N}/{ruta}:{exp}")` (hex/base64url truncado). El
   path ya contiene `company{N}` → una firma válida para company A no sirve para company B (distinto
   mensaje firmado) ni para otro archivo.
2. **Firmado (backend):** al serializar mensajes con media (lista de tickets/mensajes, socket emits,
   quoted messages) se devuelve la **URL completa firmada** en `mediaUrl`, con `exp` = ahora + TTL
   (p.ej. 24 h; TTL configurable). Centralizar en un helper `signMediaUrl(companyId, filename)` usado
   por todos los serializadores (hoy la construye el front → pasa a construirla el backend).
3. **Verificación (backend):** middleware ANTES de `express.static` en `/public` que valida `exp` no
   vencido + `sig` correcta; si falla → 404 (no revelar existencia). Mantener el middleware de
   `?download` actual.
4. **Secreto:** `MEDIA_SIGNING_SECRET` en `.env` (nuevo; lo pone JC, `.env` read-only para el agente).
   Alternativa sin nuevo env: derivar de `JWT_SECRET` con un salt fijo (documentar el trade-off).
5. **Front:** usar `message.mediaUrl` **tal cual** (ya viene firmada del backend); quitar la
   construcción manual de la URL. Rebuild del SPA.

## Rollout seguro (sin ventana de media rota)
1. Backend deploy que **firma** las URLs al serializar y **acepta ambas** (firmada y sin firmar)
   temporalmente en el verificador (modo permisivo) → nada se rompe.
2. Front deploy que usa la URL firmada del backend (rebuild + swap).
3. Backend flip a **enforce** (sin firma → 404). Cierra el P0.
4. Cada paso con verificación + rollback (swap inverso / revertir middleware).

## Acceptance (binario)
- AC1: `GET /be/public/company8/<file>` **sin** `?sig` válido → **404** (hoy 200).
- AC2: URL firmada válida y no expirada → **200** con el archivo; renderiza en `<img>`.
- AC3: URL firmada **expirada** o con `sig` alterada → **404**.
- AC4: firma de company A aplicada a un path de company B → **404**.
- AC5: la app muestra la media de mensajes/tickets sin rotura (smoke de la bandeja con imágenes).
- AC6: `ci-gate.sh` verde.

## Pruebas
Sonda: media sin firma (404), con firma válida (200), con firma vencida (404), con firma cross-company
(404); smoke visual de la bandeja (imágenes cargan). Backup W0-GATE-01 vigente como red.

## Rollback
Middleware verificador en modo permisivo → revertir a estado previo; front → swap del `dist_bak`.

## Talla / dependencias
**L.** Requiere: helper de firma + verificador + tocar los serializadores de mensajes, cambio de
front (usar URL del backend) + **rebuild**, y `MEDIA_SIGNING_SECRET` puesto por JC. Ventana de baja
carga. No es un fix quirúrgico como P0-A..D.
