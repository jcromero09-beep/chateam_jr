#!/usr/bin/env bash
#
# Dedup periódico de public/ por hardlink — mantiene el ahorro de la Fase B3.
# (Ref: docs/SPEC_CABLEADO_STORAGE_MEDIA.md · el dedup manual del 2026-07-17 liberó 12.21 GiB.)
#
# SEGURO:
#   - `hardlink -c` compara el contenido BYTE-A-BYTE (sha256) y solo enlaza archivos
#     idénticos. Nunca borra datos ni mueve archivos: la ruta se conserva, así que los
#     getters mediaUrl (Message.mediaUrlWithBaseUrl) siguen resolviendo.
#   - No-destructivo: hardlink no pierde bytes; `cp` rompe el enlace si se quieren copias.
#
# GENTIL CON EL NAS:
#   - nice -n 19 (prioridad CPU mínima) + ionice -c3 (I/O idle) para no disparar el
#     watchdog de saturación de 4 cores.
#
set -uo pipefail

PUB="/home/jcromero09/chateam_jr/public"
LOG="/home/jcromero09/chateam_jr/logs/dedup-media.log"

[ -d "$PUB" ] || { echo "$(date '+%F %T') ERROR: no existe $PUB" >> "$LOG"; exit 1; }

{
  echo "===== $(date '+%F %T') dedup start ====="
  nice -n 19 ionice -c3 hardlink -c "$PUB" 2>&1 | grep -iE "Files|Linked|Saved|Duration"
  echo "----- end -----"
} >> "$LOG" 2>&1
