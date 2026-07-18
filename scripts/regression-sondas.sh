#!/usr/bin/env bash
#
# Suite de regresión de invariantes (Ola 4). Cristaliza las sondas de la sesión
# 2026-07 en un check re-ejecutable. Verifica contra el backend VIVO (:3010) los
# invariantes de seguridad/integridad que se arreglaron — cosas que los 367 tests
# unit NO cubren (aislamiento cross-tenant, rate-limit, authz super, esquema).
#
# Uso:   bash scripts/regression-sondas.sh
# Salida: exit 0 si todo pasa; exit 1 si algún invariante se rompió (CI-able).
#
# Solo lectura / no-mutante: usa la cuenta de pruebas qa-agent (userId 69, super,
# company 1) y datos de otra empresa solo para comprobar que devuelven 404.
#
set -uo pipefail

BASE="${CHATEAM_BASE:-http://localhost:3010}"
QA_EMAIL="${QA_EMAIL:-qa-agent@chateam.com}"
QA_PASS="${QA_PASS:-QaAgent.2026}"
FAILS=0
ok()   { echo "  ✅ $1"; }
fail() { echo "  ❌ $1"; FAILS=$((FAILS+1)); }

hcode() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== Regresión de invariantes chateam ($BASE) =="

# --- 0. Salud ---
[ "$(hcode "$BASE/health")" = "200" ] && ok "/health 200" || fail "/health no responde 200"

# --- 1. Auth: login válido -> token ---
TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$QA_EMAIL\",\"password\":\"$QA_PASS\"}" | \
  python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))" 2>/dev/null)
[ -n "$TOKEN" ] && ok "login qa-agent -> token" || { fail "login qa-agent falló"; echo "ABORT"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

# --- 2. Aislamiento multi-tenant (IDOR QueueIntegration): flow de otra empresa -> 404 ---
C=$(hcode "$BASE/queueIntegration/1" -H "$AUTH")
[ "$C" = "404" ] && ok "cross-tenant /queueIntegration/1 -> 404 (aislado)" || fail "cross-tenant /queueIntegration/1 -> $C (esperado 404)"

# --- 3. Super-admin: /recepts 200 (migración receipts) + POST /companies exige super ---
C=$(hcode "$BASE/recepts/" -H "$AUTH")
[ "$C" = "200" ] && ok "/recepts/ 200 (columnas receipts presentes)" || fail "/recepts/ -> $C (regresó el 500 de columnas?)"
C=$(hcode -X POST "$BASE/companies" -H "$AUTH" -H 'Content-Type: application/json' -d '{}')
[ "$C" != "403" ] && ok "POST /companies: super pasa el guard isSuper ($C)" || fail "POST /companies bloquea al super (403)"

# --- 4. Endpoints PLATAFORMA clave sin 500 (deriva de esquema) ---
for p in /companies/list /plans /ai-costs/summary /ai/subplans /affiliates/dashboard /tickets?pageNumber=1; do
  C=$(hcode "$BASE$p" -H "$AUTH")
  [ "$C" = "200" ] && ok "GET $p 200" || fail "GET $p -> $C (500 latente por deriva?)"
done

# --- 5. Rate limiter en login (brute-force) ---
BF_EMAIL="regression-bf-$(cat /proc/sys/kernel/random/uuid 2>/dev/null | cut -c1-8 || echo x).test"
SAW_429=0
for i in $(seq 1 7); do
  C=$(hcode -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$BF_EMAIL\",\"password\":\"wrong\"}")
  [ "$C" = "429" ] && SAW_429=1
done
[ "$SAW_429" = "1" ] && ok "rate-limit login: 429 tras N fallos" || fail "rate-limit login: nunca dio 429 (brute-force sin protección)"

echo
if [ "$FAILS" -eq 0 ]; then echo "== ✅ TODOS los invariantes OK =="; exit 0
else echo "== ❌ $FAILS invariante(s) roto(s) =="; exit 1; fi
