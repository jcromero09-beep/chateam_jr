# W0-INV-01 — Re-sondeo de los 13 endpoints reportados en 500

> Ola 0 (INV) · 2026-07-24 · Sonda **autenticada, read-only (solo GET)** autorizada por JC. Login con
> credencial demo super-admin (baseline), vía `http://127.0.0.1:3010` (mismo handler que `/be`, más
> liviano para el NAS). No se modificó nada.

## Resultado: de 13 "siempre-500" de la SPEC, **11 responden 200 hoy; solo 2 siguen en 500**

| Endpoint | HTTP (perfil super) |
|---|---|
| `/tickets/counts` | **200** |
| `/ticketreport/reports` | **500** |
| `/contacts/list-whatsapp` | **200** |
| `/dashboard/ticketsUsers` | **200** |
| `/dashboard/ticketsDay` | **200** |
| `/campaigns/list` | **200** |
| `/quick-messages/list` | **200** |
| `/announcements/list` | **500** |
| `/invoices/list` | **200** |
| `/ai/credits/transactions` | **200** |
| `/ai/credits/analytics` | **200** |
| `/ai/agents/metrics` | **200** |
| `/settings/terms/stats` | **200** |

Los 2 en 500 devuelven cuerpo genérico `{"error":"Internal server error"}`; el mensaje real no aparece
en `chateam-node-error.log` (va a otro logger) → la causa exacta requiere lectura de log de aplicación
en la fase de fix.

## Reclasificación
- **NFR-003** ("13/79 en 500") pasa de PARCIAL a **mayormente OBSOLETO**: 11/13 corregidos.
- **W4-FUNC-01** se **reduce de 13 a 2 endpoints** confirmados: `/ticketreport/reports` y
  `/announcements/list`. Talla L → **S/M**.

## Caveat de método
- Probado **solo con perfil super-admin**. Los 500 de la SPEC eran ×4 perfiles; algún endpoint podría
  fallar para `admin`/`supervisor`/`user` o con parámetros distintos. Un barrido ×4 perfiles queda como
  sub-paso (no se ejecutó para no gastar el rate-limit de login ni multiplicar tráfico).
- Los GET se hicieron sin query params; los 2 en 500 podrían depender de parámetros requeridos (a
  verificar en el fix). Nada de esto cambia el titular: la mayoría ya no está en 500.
