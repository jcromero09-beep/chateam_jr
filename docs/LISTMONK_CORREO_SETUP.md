# Envío de Correos — Listmonk + SMTP (ChatEAM JR)

> **Documento de operación.** Explica cómo se envían los correos, por qué dominio salen,
> por qué puerto, dónde se configura cada cosa y cómo diagnosticar fallos.
> Basado en la configuración **real** del servidor (2026-07-08).

---

## 1. Resumen en 30 segundos

| Pregunta | Respuesta |
|---|---|
| **¿Por qué puerto salen los correos?** | **465 (TLS/SSL implícito)** |
| **¿Por qué servidor SMTP salen?** | **`mail.chateam.ws`** |
| **¿Con qué cuenta se autentica el envío?** | **`soporte@chateam.ws`** (auth `login`) |
| **¿Qué dominio ve el destinatario en el "De"?** | **`soporte chateam <soporte@chateam.ws>`** → dominio **`chateam.ws`** |
| **¿Quién manda físicamente el correo?** | **Listmonk** (contenedor Docker), no el backend Node directamente |
| **¿Qué pasa si Listmonk falla?** | El backend cae a **SMTP directo** con nodemailer (mismo `mail.chateam.ws:465`) |

**El puerto de salida (465) NO está en el `.env` del backend** — está configurado **dentro de Listmonk**
(panel → Settings → SMTP, guardado en la BD de Listmonk). El `.env` solo tiene el SMTP del *fallback*.

---

## 2. Arquitectura del envío (flujo real)

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  CAMINO PRINCIPAL (LISTMONK_ENABLED=true)                                 │
  └──────────────────────────────────────────────────────────────────────────┘

   Backend Node (node-1/node-2)
   helpers/SendMail.ts  ──►  helpers/ListmonkClient.ts
        │                         │  HTTP  Authorization: token chateam_app:<API_TOKEN>
        │                         ▼
        │                   Listmonk (contenedor Docker)
        │                   http://192.168.100.21:9000   (solo LAN + localhost)
        │                         │  encola y renderiza plantilla
        │                         ▼
        │                   SMTP de salida (config DENTRO de Listmonk)
        │                   ► mail.chateam.ws : 465  (TLS)  auth soporte@chateam.ws
        │                         │
        │                         ▼
        │                   📧  Buzón del destinatario   (From: soporte@chateam.ws)
        │
        └──────► si Listmonk falla / timeout ─────────────────────────────────┐
                                                                              ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  FALLBACK (nodemailer directo)                                            │
  │  helpers/SendMail.ts → nodemailer → mail.chateam.ws:465 (SSL)             │
  │  usa MAIL_HOST / MAIL_USER / MAIL_PASS del .env                           │
  └──────────────────────────────────────────────────────────────────────────┘
```

**Clave:** en el camino principal el backend **no abre SMTP**; hace una petición **HTTP** a Listmonk
(en la red local `192.168.100.21:9000`). Listmonk es quien abre la conexión SMTP hacia
`mail.chateam.ws:465`. Solo en el fallback el backend habla SMTP directo.

---

## 3. Los 3 lugares donde se configura (muy importante no confundirlos)

| # | Capa | Archivo / lugar | Qué controla |
|---|------|-----------------|--------------|
| 1 | **Servicio Listmonk** | [`docker-compose.listmonk.yml`](../docker-compose.listmonk.yml) | El contenedor Listmonk + su Postgres, puerto **9000**, admin inicial |
| 2 | **Backend → Listmonk** | [`.env`](../.env) (`LISTMONK_*`) | Cómo el backend **habla con** Listmonk (URL, token, plantilla, lista) |
| 3 | **Listmonk → mundo** | **Panel de Listmonk** (Settings → SMTP) — se guarda en la BD de Listmonk | **El SMTP de SALIDA: host, PUERTO, usuario, TLS** ← *aquí está el puerto 465* |

> Si quieres cambiar **el puerto o servidor por donde salen los correos**, se hace en el
> **panel de Listmonk (capa 3)**, NO en el `.env`.

---

## 4. Detalle por capa

### 4.1 Capa 1 — Contenedor Listmonk (`docker-compose.listmonk.yml`)

- **Imagen:** `listmonk/listmonk:latest` + `postgres:15-alpine` (BD dedicada `listmonk-db`).
- **Puerto del panel/API:** `9000`, expuesto **solo en LAN** (`192.168.100.21:9000`) y `127.0.0.1:9000`.
  **No está publicado a internet** (verificado: no hay `server` de Listmonk en `nginx/`).
- **Red Docker:** `chateam-listmonk-net` (Listmonk ↔ su Postgres).
- **Admin del panel:** usuario `chateam_admin` — contraseña en la variable `LISTMONK_ADMIN_PASSWORD`
  del propio `docker-compose.listmonk.yml`.
- **Datos persistentes (volúmenes):** `chateam-listmonk-db-data` (BD) y `chateam-listmonk-uploads` (adjuntos).

> ⚠️ En el servidor conviven **dos** instancias Listmonk:
> - `listmonk` (puerto **9000**) → **la de ChatEAM JR** (esta).
> - `taller-listmonk` (puerto **9001**) → otro proyecto ("taller"). No las confundas.

Comandos:
```bash
# Levantar
docker compose -f docker-compose.listmonk.yml up -d
# Inicializar BD (solo la PRIMERA vez)
docker compose -f docker-compose.listmonk.yml run --rm listmonk ./listmonk --install --yes
# Logs / estado
docker logs -f listmonk
docker ps | grep listmonk
```

### 4.2 Capa 2 — Cómo el backend habla con Listmonk (`.env`)

```ini
LISTMONK_ENABLED=true                       # true = Listmonk es el pipe principal; false = solo nodemailer
LISTMONK_URL=http://192.168.100.21:9000     # API interna (LAN)
LISTMONK_API_USER=chateam_app               # usuario de API (NO el admin del panel)
LISTMONK_API_TOKEN=********                  # token de API (secreto — ver .env real)
LISTMONK_FROM_EMAIL=soporte@chateam.ws      # remitente
LISTMONK_FROM_NAME=soporte chateam
LISTMONK_PASSTHROUGH_TEMPLATE_ID=5          # plantilla "passthrough" para correos transaccionales
LISTMONK_TRANSACTIONAL_LIST_ID=3            # lista donde se registran los destinatarios tx
LISTMONK_TIMEOUT_MS=10000                   # si Listmonk no responde en 10s → fallback
```

Cliente: [`helpers/ListmonkClient.ts`](../helpers/ListmonkClient.ts) — se autentica con
`Authorization: token chateam_app:<API_TOKEN>` y expone:
- `sendTransactional()` → `POST /api/tx` (correo 1‑a‑1, usa la plantilla passthrough #5).
- `sendCampaign()` → `POST /api/campaigns` + `PUT /api/campaigns/:id/status {running}` (envío masivo).
- `ensureSubscriber()` → `POST /api/subscribers` (Listmonk exige que el destinatario exista antes del `tx`).
- `getCampaignAnalytics()` → aperturas/clicks/bounces.
- `healthCheck()` → `GET /api/config`.

### 4.3 Capa 3 — El SMTP de SALIDA (config dentro de Listmonk) ⭐

Esta es la que responde **"puerto donde salen los correos"**. Config **activa** hoy:

| Parámetro | Valor |
|---|---|
| **Host** | `mail.chateam.ws` |
| **Puerto** | **`465`** |
| **TLS** | `TLS` (SSL implícito, correcto para el 465) |
| **Usuario (auth)** | `soporte@chateam.ws` |
| **Protocolo de auth** | `login` |
| **Máx. conexiones** | `10` |
| **Reintentos por mensaje** | `3` |
| `tls_skip_verify` | `true` (no valida el certificado del SMTP) |

> Hay un **segundo servidor SMTP** cargado en Listmonk (`smtp.gmail.com:465`) pero está **desactivado**
> (`enabled=false`, con usuario placeholder). Es solo un ejemplo, no envía.

Config general de la app (BD de Listmonk):
- `app.from_email` = `soporte chateam <soporte@chateam.ws>`
- `app.site_name` = `ChatEAM Mailer`
- `app.message_rate` = `10` msg/seg · `app.concurrency` = `10` · `app.max_send_errors` = `1000`
- `app.root_url` = `http://192.168.100.21:9000`

Para verlo/cambiarlo: **panel Listmonk → Settings → SMTP**. O leerlo de su BD:
```bash
docker exec listmonk-db psql -U listmonk -d listmonk -tA -c "SELECT value FROM settings WHERE key='smtp';"
```

---

## 5. Por qué dominio y puerto salen los correos (resumen)

- **Dominio del remitente (lo que ve el cliente):** `chateam.ws` → dirección `soporte@chateam.ws`.
  Se define en `app.from_email` (Listmonk) y en `LISTMONK_FROM_EMAIL` (backend).
- **Servidor y puerto de salida reales:** `mail.chateam.ws` : **`465`** (TLS), autenticando como
  `soporte@chateam.ws`. Se define en el **SMTP de Listmonk** (capa 3).
- **`mail.chateam.ws`** resuelve a las IPs `195.26.251.153` y `195.26.249.14` (proveedor de correo externo,
  el MX del dominio apunta ahí).

---

## 6. Tipos de envío

| Tipo | Método backend | Endpoint Listmonk | Uso |
|------|----------------|-------------------|-----|
| **Transaccional** (1 destinatario: recuperar contraseña, notificación, etc.) | `listmonkClient.sendTransactional()` | `POST /api/tx` (plantilla #5) | Correos sueltos disparados por el sistema |
| **Campaña** (masivo a una lista) | `listmonkClient.sendCampaign()` | `POST /api/campaigns` → `running` | Email marketing / boletines |

Consumidores en el código: `helpers/SendMail.ts` (transaccional + fallback),
`services/EmailMarketing/providers/ListmonkProvider.ts` y su `ProviderFactory`/`EmailMarketingFactory`,
`services/EmailMarketing/EmailDashboardService.ts` (métricas), `jobs/ListmonkAnalyticsSync.ts` (sincroniza analytics).

---

## 7. Entregabilidad (DNS del dominio `chateam.ws`)

Estado actual de los registros:

| Registro | Valor actual | Estado |
|---|---|---|
| **MX** | `mail.chateam.ws` (prio 0) | ✅ correcto |
| **SPF (TXT)** | `v=spf1 ip4:190.12.52.206 mx:mail.elbakan.com ip4:195.26.249.14 ~all` | ⚠️ ver nota |
| **A `mail.chateam.ws`** | `195.26.251.153`, `195.26.249.14` | ℹ️ 2 IPs |
| **DKIM `default._domainkey`** | (vacío en el selector `default`) | ⚠️ verificar selector real |

**⚠️ Notas de deliverability (revisar para que no caiga en spam):**
1. **SPF incompleto:** `mail.chateam.ws` tiene **dos** IPs (`195.26.251.153` y `195.26.249.14`), pero el SPF
   solo autoriza `195.26.249.14`. Si el correo sale por `195.26.251.153`, el SPF da *softfail* (`~all`).
   → Considerar añadir `ip4:195.26.251.153` (o usar `mx` que ya cubre ambas si el envío es por el MX).
2. **DKIM:** el selector `default` está vacío. Confirmar con el proveedor de correo cuál es el selector real
   (p.ej. `mail._domainkey`, `s1._domainkey`) y que esté publicado; sin DKIM válido baja la reputación.
3. **DMARC:** revisar si existe `_dmarc.chateam.ws` (no confirmado aquí); recomendado al menos `p=none` para monitorear.

> Estas son verificaciones de **configuración DNS del proveedor de correo**, no de código.

---

## 8. Operación y diagnóstico

**Acceso al panel (desde la LAN o túnel SSH, no está en internet):**
- URL: `http://192.168.100.21:9000` (o `http://127.0.0.1:9000` en el propio servidor).
- Usuario admin: `chateam_admin` · contraseña: ver `LISTMONK_ADMIN_PASSWORD` en `docker-compose.listmonk.yml`.
- Túnel desde tu equipo: `ssh -L 9000:127.0.0.1:9000 usuario@servidor` y abre `http://localhost:9000`.

**Chequeos rápidos:**
```bash
# ¿Listmonk vivo?
curl -s http://192.168.100.21:9000/api/health && echo OK

# ¿El backend puede autenticar contra Listmonk? (200 = ok)
curl -s -o /dev/null -w "%{http_code}\n" http://192.168.100.21:9000/api/config \
  -H "Authorization: token chateam_app:<API_TOKEN>"

# Ver estado de envío / errores de Listmonk
docker logs --tail 100 listmonk | grep -iE "smtp|error|bounce|sent"

# Ver la config SMTP de salida (host/puerto)
docker exec listmonk-db psql -U listmonk -d listmonk -tA -c "SELECT value FROM settings WHERE key='smtp';"
```

**Troubleshooting:**

| Síntoma | Dónde mirar | Causa típica |
|---|---|---|
| No llega ningún correo | `docker logs listmonk` | SMTP de salida mal (host/puerto/credenciales) → capa 3 |
| Backend loguea `[Listmonk] ... fallo` y usa nodemailer | logs del backend (`pm2 logs node-1`) | Listmonk caído/timeout → revisar contenedor |
| Correos a spam | DNS (sección 7) | SPF/DKIM/DMARC incompletos |
| `tx` falla con "template not found" | panel Listmonk → Templates | `LISTMONK_PASSTHROUGH_TEMPLATE_ID=5` no existe |
| `tx` falla con subscriber | — | Listmonk exige subscriber; `ensureSubscriber` lo crea (lista #3) |
| Auth 401 contra Listmonk | `.env` | `LISTMONK_API_USER`/`LISTMONK_API_TOKEN` incorrectos o usuario de API deshabilitado |

**Activar / desactivar Listmonk como pipe principal:** cambiar `LISTMONK_ENABLED` en `.env`
(`true` = Listmonk primero con fallback; `false` = solo nodemailer directo) y `pm2 restart node-1 node-2`.

---

## 9. Checklist de "por qué / cómo salen los correos"

- [x] Salen por **`mail.chateam.ws:465` (TLS)**, auth `soporte@chateam.ws` — config **en Listmonk** (capa 3).
- [x] Remitente/dominio: **`soporte@chateam.ws`** (`chateam.ws`).
- [x] El backend habla con Listmonk por **HTTP en LAN** (`192.168.100.21:9000`), no por SMTP.
- [x] Fallback SMTP directo (nodemailer) con las mismas credenciales del `.env`.
- [x] Listmonk **no** está expuesto a internet (solo LAN/localhost).
- [ ] **Pendiente recomendado:** completar SPF (2ª IP) y confirmar DKIM/DMARC para deliverability.

---

_Última actualización: 2026-07-08 · Fuente: `docker-compose.listmonk.yml`, `.env`, `helpers/ListmonkClient.ts`, BD de Listmonk, DNS de `chateam.ws`._
