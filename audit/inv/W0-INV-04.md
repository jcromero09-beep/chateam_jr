# W0-INV-04 — `npm audit` de dependencias (prod)

> Ola 0 (INV) · 2026-07-24 · `npm audit --omit=dev --json` (read-only, no modifica lockfile). Load NAS
> 2.67. Autorizado por JC.

## Resultado: 0 críticas · **21 high** · 20 moderate · 1 low (42 total)

El `scripts/ci-gate.sh` solo bloquea **críticas** (baseline 0) → las **21 high pasan el gate hoy**
sin ser vistas. Ninguna es crítica, pero varias intersecan con hallazgos de la auditoría:

| Paquete | Sev | Riesgo | Intersección |
|---|---|---|---|
| **axios** | high | SSRF por NO_PROXY bypass + auth-bypass por prototype pollution en `validateStatus` | Refuerza **A-7 (SSRF)**; axios es el cliente HTTP de todo el backend |
| **engine.io** | high | Engine.IO Polling **Connection Exhaustion (DoS)** | Mismo transporte del **P0 Socket.IO (SEC-P0-1)** — DoS además de la fuga |
| **baileys → link-preview-js** | high | link-preview-js SSRF a IPv6/loopback interno | Confirma la duda de deps de baileys (`seguridad-privacidad` PR/deps); `baileys@7.0.0-rc13` RC |
| **lodash** | high | Code injection vía `_.template`; prototype pollution en `_.unset/_.omit` | Transversal |
| **nodemailer** | high | SMTP command injection (CRLF en transport/envelope) | Módulo Email (FR-016) |
| **form-data** | high | CRLF injection en multipart | Uploads / requests salientes |
| **fast-xml-parser / fast-xml-builder** | high | Entity expansion bypass / atributos no saneados | Parsing XML (integraciones) |
| **@xmldom/xmldom** | high | Recursión no controlada (DoS) + XML injection | XML |
| **hono, fast-uri, minimatch, brace-expansion, @grpc/grpc-js** | high | ReDoS / host confusion / IP restriction bypass / crash | Transitivas |

## Clasificación / impacto en el plan
- **W8-DEBT (deps)**: nueva sub-tarea — actualizar las 21 high; priorizar `axios` (SSRF, refuerza
  A-7) y `engine.io` (DoS del transporte del P0 socket).
- **W6-INFRA-02 / gate**: proponer que `ci-gate.sh` gatee también **high nuevas** (hoy solo críticas),
  con baseline documentado de estas 21.
- `whatsapp-rust-bridge` no apareció por nombre en el árbol de `npm audit` (bridge nativo, fuera del
  grafo npm) → esa duda concreta sigue **NO VERIFICABLE** por esta vía.

## Límite
`npm audit` reporta sobre `package-lock.json`; la explotabilidad real depende del uso de cada API
vulnerable en el código (no se trazó cada una). No se modificó el lockfile.
