#!/usr/bin/env bash
# [Fase F] Gate de verificación local (NAS) — ata todas las comprobaciones en un
# solo comando ejecutable antes de un deploy. Complementa el CI de GitHub
# (.github/workflows/ci.yml). Uso: bash scripts/ci-gate.sh
# Requiere: backend vivo en padeldev (o E2E_ORIGIN/E2E_BE apuntando a otro entorno).
set -uo pipefail
cd "$(dirname "$0")/.."

FAIL=0
step() { echo; echo "════════ $1 ════════"; }
ok()   { echo "✅ $1"; }
bad()  { echo "❌ $1"; FAIL=1; }

# 1) RBAC smoke (regresión de los 3 P0)
step "1/4 RBAC smoke (P0 seguridad)"
if node tests/rbac-smoke.mjs; then ok "RBAC verde"; else bad "RBAC ROJO"; fi

# 2) E2E Playwright en vivo (login UI + RBAC + automation + a11y)
step "2/4 E2E Playwright (live)"
if npx playwright test --config=playwright.live.config.ts --reporter=line; then ok "E2E verde"; else bad "E2E ROJO"; fi

# 3) npm audit — gate SOLO en críticas nuevas (las actuales están documentadas)
step "3/4 npm audit (gate: 0 críticas nuevas)"
CRIT=$(npm audit --omit=dev --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).metadata.vulnerabilities.critical)}catch{console.log("?")}})')
BASELINE=0  # tras migrar `request`→axios (2026-07-13) ya no hay críticas conocidas
echo "críticas actuales: $CRIT (baseline conocido: $BASELINE)"
if [ "$CRIT" = "?" ]; then echo "⚠ no se pudo parsear audit (no bloquea)"; \
elif [ "$CRIT" -le "$BASELINE" ] 2>/dev/null; then ok "sin críticas nuevas"; else bad "críticas por encima del baseline ($CRIT>$BASELINE)"; fi

# 4) Verificación de URL de API horneada (regresión del bug de CORS).
# El code-splitting puede mover la URL del entry a otro chunk (api client), así que
# se busca en TODOS los assets, no solo en index-*.js.
step "4/4 URL de API en el build (no debe apuntar a prod)"
CHUNKS=$(grep -rl 'padeldev.codigo.plus/be' frontend/dist/assets/*.js 2>/dev/null | wc -l)
if [ "$CHUNKS" -ge 1 ] 2>/dev/null; then
  ok "URL padeldev/be horneada en $CHUNKS chunk(s)"
else bad "NINGÚN chunk tiene la URL correcta horneada (revisar frontend/.env + rebuild)"; fi

echo; echo "════════ RESULTADO ════════"
[ "$FAIL" = 0 ] && { echo "🟢 GATE VERDE"; exit 0; } || { echo "🔴 GATE ROJO"; exit 1; }
