# CONTEXTO COMPARTIDO — Auditoría & Inventario chateam_jr (2026-07-12)

Método: **Spec-Driven**. Cada agente produce su `.md` con esta plantilla:
```
# <Dominio> — Inventario & Auditoría (Spec-Driven)
## 1. Propósito / Alcance
## 2. Inventario (el "qué": tablas/rutas/componentes/deps — EXHAUSTIVO, con conteos)
## 3. Arquitectura & Flujos (el "cómo")
## 4. Hallazgos (deuda/gaps/riesgos, con SEVERIDAD P0/P1/P2/P3)
## 5. Recomendaciones
## 6. Evidencia (archivo:línea, comandos, salidas)
```

## Sistema
- Proyecto: `/home/jcromero09/chateam_jr` (chateam-platform v1.1.0). Plataforma omnicanal WhatsApp/IA multi-tenant.
- Stack: Node.js+TS (ESM, tsx), Express, React+Vite (frontend/), PostgreSQL 17 + pgvector, Redis, Bull, Socket.IO, PM2.
- Corriendo en https://padeldev.codigo.plus (SPA en `/`, backend bajo prefijo `/be/`, socket `/socket.io/`). Backend local: http://127.0.0.1:3010.
- Multi-tenant por columna `companyId`. Perfiles de usuario: super-admin (super=true), admin, supervisor, user.

## Acceso a datos (para agentes que consulten la BD)
```
docker exec chateam-postgres psql -U atendimento -d chateamjr -c "SQL..."
```
(187 tablas en schema public; extensiones pg_trgm, unaccent, vector.)

## Credenciales de SONDA (copia restaurada — solo lectura/GET en las sondas)
| perfil | email | pass | companyId |
|---|---|---|---|
| super-admin | admin@chateam.com | Chateam.Admin2026 | 1 |
| admin | bryan@gmail.com | Probe.2026 | 8 |
| supervisor | dinaspa@gmail.com | Probe.2026 | 10 |
| user | christian@smarttrack.com | Probe.2026 | 6 |

Login API: `POST /be/api/auth/login` {email,password} → token JWT. (base https://padeldev.codigo.plus)

## Reglas
- Código = SOLO LECTURA (grep/read). NO modificar código fuente.
- Sondas = SOLO GET (no POST/PUT/DELETE) para no mutar datos.
- Escribir hallazgos en el `.md` asignado bajo `AUDITORIA_2026_07/<carpeta>/`.
- Ser EXHAUSTIVO: conteos reales, nombres reales, no genéricos.
