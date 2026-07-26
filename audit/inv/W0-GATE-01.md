# W0-GATE-01 — Backup cifrado verificado (prerequisito de la ola P0)

> 2026-07-25 · Autorizado por JC. Backup **no destructivo** (solo lectura del stack vivo). Destino
> fuera del árbol servido y del repo: `/home/jcromero09/backups/chateam/` (perms 700).

## Contenido

| Componente | Archivo | Tamaño | Método |
|---|---|---|---|
| BD `chateamjr` (pg17) | `chateamjr_20260725_212426.dump.enc` | 93M | `pg_dump -Fc` → `openssl aes-256-cbc -pbkdf2` (plano nunca tocó disco) |
| Redis `/data` (RDB+AOF) | `redis_20260725_212426.tar.enc` | 20M | `tar` de `/data` → mismo cifrado |
| Media `public/` | `public_20260725_212426.tar.enc` | 4,8G | `tar` (sin compresión, media ya comprimida) → mismo cifrado |
| Passphrase | `passphrase_20260725_212426.txt` | — | `openssl rand -base64 32`, archivo `chmod 600` |

**public/ verificado:** descifrado + `tar -t` (sin extraer) lista **9.449 archivos regulares** (=
baseline exacto de `find`) + 29 dirs, **0 errores** de tar/openssl.

## Verificación de restauración (ensayo realizado)
Se restauró el dump en una BD temporal aislada `chateamjr_verify` y se compararon conteos con el
baseline pre-backup; **coinciden exactamente**, luego se eliminó la BD temporal:

| Tabla | Baseline | Restaurado |
|---|---|---|
| Companies | 17 | 17 ✓ |
| Tickets | 7.451 | 7.451 ✓ |
| Messages | 79.219 | 79.219 ✓ |
| LogTickets | 225.675 | 225.675 ✓ |
| Contacts | 11.393 | 11.393 ✓ |
| Whatsapps | 31 | 31 ✓ |

`pg_restore rc=0`. **RPO** = momento del dump (2026-07-25 21:24). **RTO** ≈ minutos (restore de 363MB).

## Runbook de restauración (si un P0 sale mal)
```
BK=/home/jcromero09/backups/chateam ; TS=20260725_212426
# BD (a una base nueva o, con cuidado, a la real tras DROP):
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$BK/passphrase_$TS.txt -in $BK/chateamjr_$TS.dump.enc \
  | docker exec -i chateam-postgres pg_restore -U atendimento -d <db_destino> --no-owner --no-acl
# Redis:
openssl enc -d -aes-256-cbc -pbkdf2 -pass file:$BK/passphrase_$TS.txt -in $BK/redis_$TS.tar.enc \
  | docker exec -i chateam-redis sh -c 'tar -C /data -xf -'   # requiere redis parado para RDB limpio
```

## Recomendaciones de seguridad del backup
- ⚠ La passphrase está **co-ubicada** con los cifrados (mismo dir 700). Mitiga si se exfiltra un solo
  archivo, pero no si se copia el directorio. **Mover `passphrase_*.txt` a un gestor de contraseñas /
  otra ubicación** y borrarla de aquí para separar clave y datos.
- El dump contiene **PII de todos los tenants + secretos**; el cifrado en reposo lo protege. No mover el
  cifrado a ubicaciones compartidas sin la separación de clave.

## Estado del gate
**W0-GATE-01 = COMPLETO** para la ola P0 (BD verificada + Redis). Desbloquea la aplicación de los P0
SENSIBLES (W1-SEC-01/02/12, W5-API-04), **cada uno con su go explícito** (Regla 8) y su ventana.
