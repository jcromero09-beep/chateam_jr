#!/usr/bin/env bash
# Build del frontend (Ola 3) con límite de memoria (systemd-run --user si está
# disponible) + safe-swap del dist. Pensado para correr en ventana de baja carga.
# NO usa `rm -rf` (el hook lo bloquea): la limpieza va con `find -delete`.
set -euo pipefail

NVM_BIN="$HOME/.nvm/versions/node/v22.22.0/bin"
[ -d "$NVM_BIN" ] && export PATH="$NVM_BIN:$PATH"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=${XDG_RUNTIME_DIR}/bus}"

cd /home/jcromero09/chateam_jr/frontend
LOG=/tmp/chateam-frontend-build.log
TS="$(date +%Y%m%d_%H%M%S)"
echo "=== build $TS (node $(node -v 2>/dev/null)) ===" >> "$LOG"

# Idempotente: solo reconstruir si la fuente cambió desde el último dist
# (así el cron nocturno no gasta ciclos en noches sin cambios).
if [ -d dist ] && [ -z "$(find src index.html vite.config.* package.json tsconfig*.json -newer dist -print -quit 2>/dev/null)" ]; then
  echo "Sin cambios de fuente desde el último dist; no se reconstruye ($TS)." >> "$LOG"
  exit 0
fi

# Prefijo de ejecución con límite de memoria si systemd --user responde.
# MemoryHigh throttlea (empuja a swap) y MemoryMax evita que el OOM-killer
# tumbe servicios críticos del NAS mientras dura el build.
RUN=()
if systemd-run --user --scope -q true >/dev/null 2>&1; then
  RUN=(systemd-run --user --scope -p MemoryHigh=5G -p MemoryMax=6500M)
  echo "systemd-run --user: activo (MemoryHigh=5G MemoryMax=6500M)" >> "$LOG"
else
  echo "systemd-run --user no disponible; build directo con --max-old-space-size" >> "$LOG"
fi

if "${RUN[@]}" bash -c 'NODE_OPTIONS=--max-old-space-size=6144 npx vite build --outDir dist_stage --emptyOutDir' >> "$LOG" 2>&1 \
   && [ -f dist_stage/index.html ]; then
  [ -d dist ] && mv dist "dist_bak_$TS"
  mv dist_stage dist
  echo "OK: dist actualizado ($TS). Backup: dist_bak_$TS" >> "$LOG"
  # Conservar solo los 2 backups más recientes (sin rm -rf).
  ls -1dt dist_bak_* 2>/dev/null | tail -n +3 | while IFS= read -r d; do find "$d" -delete; done
else
  echo "FALLO: build no produjo dist_stage/index.html; dist actual intacto ($TS)" >> "$LOG"
  [ -d dist_stage ] && find dist_stage -delete
  exit 1
fi
echo "=== fin $TS ===" >> "$LOG"
