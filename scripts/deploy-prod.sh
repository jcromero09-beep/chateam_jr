#!/usr/bin/env bash
#
# Despliegue por fases de chateam_jr a producción (/opt/chateam).
#
#   ./scripts/deploy-prod.sh salvaguarda   # punto de retorno, antes de nada
#   ./scripts/deploy-prod.sh desplegar     # código nuevo, con el guard en observe
#   ./scripts/deploy-prod.sh verificar     # ¿autentica? ¿el guard vería roturas?
#   ./scripts/deploy-prod.sh enforce       # activa el aislamiento estricto
#   ./scripts/deploy-prod.sh rollback      # vuelve al punto guardado
#
# Se ejecuta desde el repo de DESARROLLO (~/chateam_jr) y opera sobre /opt/chateam.
# Así la fase de salvaguarda existe antes de que producción tenga estos scripts.
#
# ## Por qué en fases y no de un tirón
#
# Son 41 commits sobre un producción que no tiene ninguno propio, así que no hay
# nada que reconciliar — pero sí dos cambios que alteran comportamiento y conviene
# separar del resto para saber cuál fue si algo se tuerce:
#
#   1. 105 paquetes con versión distinta (el `npm audit fix`, 54 -> 17
#      vulnerabilidades). Lo que compila no siempre se comporta igual: el bump de
#      axios ya cambió el tipo de las cabeceras una vez.
#   2. TENANT_SCOPE_GUARD_API=enforce. Un handler que no filtre por empresa pasa de
#      avisar a devolver vacío, y eso no se nota mirando si el proceso está vivo.
#
# La fase `desplegar` entra con el guard en OBSERVE a propósito: mismo código, mismo
# comportamiento que hoy, pero el guard empieza a registrar qué endpoints tendría que
# corregir. `verificar` lee ese registro. Solo cuando sale limpio tiene sentido
# `enforce` — que es un cambio de una línea y se revierte igual de rápido.
#
# No hay migraciones que aplicar: el arranque no las ejecuta y la única nueva
# (tokenHash) ya está en la base. El esquema de producción es compatible — es el que
# usan los 81 tests, que cargan database/schema.sql.

set -euo pipefail

PROD=/opt/chateam
DEV="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RAMA="${DEPLOY_BRANCH:-refactor/verificabilidad-y-canales}"
ESTADO="$PROD/.deploy-punto-de-retorno"
ECOSYSTEM="$PROD/ecosystem.chateam.local.config.cjs"

rojo()  { printf '\033[31m%s\033[0m\n' "$*"; }
verde() { printf '\033[32m%s\033[0m\n' "$*"; }
info()  { printf '\033[36m%s\033[0m\n' "$*"; }

abortar() { rojo "ABORTA · $*"; exit 1; }

[ -d "$PROD/.git" ] || abortar "$PROD no es un repo git"

# ---------------------------------------------------------------- salvaguarda
salvaguarda() {
  info "== Salvaguarda =="

  local rama_actual head_actual
  rama_actual=$(git -C "$PROD" rev-parse --abbrev-ref HEAD)
  head_actual=$(git -C "$PROD" rev-parse HEAD)

  # El parche del incidente se aplicó a mano y NO está commiteado. Si se deja así,
  # el checkout de la fase siguiente lo borra y la API vuelve a caer — sin que nadie
  # relacione una cosa con la otra.
  if [ -n "$(git -C "$PROD" status --porcelain)" ]; then
    info "Hay cambios sin commitear en producción. Se commitean para no perderlos:"
    git -C "$PROD" status --short | sed 's/^/    /'
    git -C "$PROD" add -A
    git -C "$PROD" commit -q -m "fix(api): parche en caliente del incidente del token (aplicado 2026-08-01)

Buscar el token de API por huella determinista en vez de por el valor en claro
contra una columna cifrada. La API pública llevaba seis días devolviendo 403.

Se commitea antes de desplegar para que el checkout no se lo lleve por delante.
La versión definitiva viene en la rama, con sus tests."
    head_actual=$(git -C "$PROD" rev-parse HEAD)
    verde "  commiteado en $rama_actual"
  else
    verde "  working tree limpio, nada que salvar"
  fi

  printf 'rama=%s\ncommit=%s\nfecha=%s\n' \
    "$rama_actual" "$head_actual" "$(date -Iseconds)" > "$ESTADO"

  verde "Punto de retorno: $rama_actual @ ${head_actual:0:8}"
  info "Guardado en $ESTADO · para volver: ./scripts/deploy-prod.sh rollback"
}

# ---------------------------------------------------------------- desplegar
desplegar() {
  info "== Desplegar (guard en observe) =="

  [ -f "$ESTADO" ] || abortar "no hay punto de retorno. Corre primero: salvaguarda"
  [ -z "$(git -C "$PROD" status --porcelain)" ] \
    || abortar "hay cambios sin commitear en $PROD. Corre primero: salvaguarda"

  info "Trayendo $RAMA..."
  git -C "$PROD" fetch origin --quiet
  git -C "$PROD" rev-parse --verify "origin/$RAMA" >/dev/null 2>&1 \
    || abortar "origin/$RAMA no existe. ¿Se hizo push?"

  # Sin el arreglo del incidente, desplegar sería un paso atrás.
  git -C "$PROD" show "origin/$RAMA:services/WhatsappService/FindWhatsappByApiToken.ts" \
    >/dev/null 2>&1 || abortar "origin/$RAMA NO lleva el arreglo del token. Falta hacer push."

  local destino
  destino=$(git -C "$PROD" rev-parse --short "origin/$RAMA")
  info "  destino: $destino"

  git -C "$PROD" checkout -B "$RAMA" "origin/$RAMA" --quiet
  verde "  código en $RAMA @ $destino"

  # 105 paquetes cambian de versión: `npm ci` reconstruye exactamente el lockfile.
  # `npm install` NO sirve aquí — resolvería versiones por su cuenta y el despliegue
  # dejaría de ser reproducible.
  info "Instalando dependencias (npm ci)..."
  ( cd "$PROD" && npm ci --no-audit --no-fund )
  verde "  dependencias al día"

  # El ecosystem de la rama trae enforce. Esta fase entra en observe a propósito.
  guard_a observe
  info "Recargando PM2..."
  ( cd "$PROD" && pm2 reload ecosystem.chateam.local.config.cjs --update-env )

  verde "Desplegado. Ahora: ./scripts/deploy-prod.sh verificar"
}

# ---------------------------------------------------------------- guard
guard_a() {
  local modo=$1
  grep -q "TENANT_SCOPE_GUARD_API" "$ECOSYSTEM" \
    || abortar "el ecosystem no define TENANT_SCOPE_GUARD_API"
  sed -i -E "s/(TENANT_SCOPE_GUARD_API: *')[a-z]+(')/\1${modo}\2/" "$ECOSYSTEM"
  grep -qE "TENANT_SCOPE_GUARD_API: *'${modo}'" "$ECOSYSTEM" \
    || abortar "no se pudo poner el guard en ${modo}"
  verde "  guard de la API: ${modo}"
}

# ---------------------------------------------------------------- verificar
verificar() {
  info "== Verificar =="

  local vivos
  vivos=$(pm2 jlist 2>/dev/null | python3 -c "
import json,sys
apps=json.load(sys.stdin)
for a in apps:
    if a['name'].startswith('chateam'):
        print(f\"  {a['name']}: {a['pm2_env']['status']} · reinicios {a['pm2_env']['restart_time']}\")
" || echo "  (no se pudo leer pm2)")
  echo "$vivos"
  echo "$vivos" | grep -q "online" || abortar "algún proceso no está online"

  # El cwd es la comprobación de que PM2 corre lo que creemos que corre. Ya pasó una
  # vez que se editaba un repo y producción servía desde otro.
  local pid cwd
  pid=$(pgrep -f "server-distributed.ts" | head -1 || true)
  if [ -n "$pid" ]; then
    cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || echo "?")
    info "  el proceso corre desde: $cwd"
    [ "$cwd" = "$PROD" ] || rojo "  OJO: no es $PROD"
  fi

  info "Probando la autenticación de la API..."
  ( cd "$PROD" && node scripts/withPm2Env.cjs npx tsx scripts/verifyApiAuth.ts ) \
    || abortar "la API no autentica"

  # Lo que decide si se puede pasar a enforce. En observe, el guard anota los
  # endpoints que tendría que corregir en vez de corregirlos: si hay avisos, activar
  # enforce cambiaría lo que devuelven.
  info "Avisos del guard de aislamiento (últimas 200 líneas de log):"
  local avisos
  avisos=$(pm2 logs chateam-node --lines 200 --nostream 2>/dev/null \
    | grep -c "would inject companyId" || true)
  if [ "${avisos:-0}" -gt 0 ]; then
    rojo "  $avisos avisos 'would inject companyId'"
    rojo "  NO pasar a enforce todavía: hay consultas sin filtro de empresa."
    pm2 logs chateam-node --lines 200 --nostream 2>/dev/null \
      | grep -A3 "would inject companyId" | grep -E "route|model" | sort -u | head -10
  else
    verde "  sin avisos · el guard no vería nada que corregir"
    info "  (con poco tráfico esto no prueba mucho: dejar correr unas horas)"
  fi
}

# ---------------------------------------------------------------- enforce
enforce() {
  info "== Activar aislamiento estricto =="
  guard_a enforce
  ( cd "$PROD" && pm2 reload ecosystem.chateam.local.config.cjs --update-env )
  verde "Guard en enforce. Verificando..."
  verificar
}

# ---------------------------------------------------------------- rollback
rollback() {
  info "== Rollback =="
  [ -f "$ESTADO" ] || abortar "no hay punto de retorno guardado"

  local rama commit
  rama=$(grep '^rama=' "$ESTADO" | cut -d= -f2)
  commit=$(grep '^commit=' "$ESTADO" | cut -d= -f2)
  info "  volviendo a $rama @ ${commit:0:8}"

  git -C "$PROD" checkout -f "$rama" --quiet
  git -C "$PROD" reset --hard "$commit" --quiet
  ( cd "$PROD" && npm ci --no-audit --no-fund )
  ( cd "$PROD" && pm2 reload ecosystem.chateam.local.config.cjs --update-env )

  verde "Revertido. La columna tokenHash se queda en la base: es aditiva y el código"
  verde "viejo la ignora, así que no hay nada que deshacer ahí."
}

case "${1:-}" in
  salvaguarda) salvaguarda ;;
  desplegar)   desplegar ;;
  verificar)   verificar ;;
  enforce)     enforce ;;
  rollback)    rollback ;;
  *)
    sed -n '3,8p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit 2
    ;;
esac
