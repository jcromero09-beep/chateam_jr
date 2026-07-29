#!/usr/bin/env bash
#
# tsc-check.sh — type-check ACOTADO a unos ficheros concretos.
#
# ## Por qué existe
#
# `npm run type-check` (`tsc -p tsconfig.json --noEmit`, el programa entero) NO
# TERMINA en esta máquina: OOM del heap de V8, exit 134, >8 min. Así que la
# comprobación real tras tocar un fichero se hacía con un tsconfig inventado a
# mano en /tmp, distinto cada vez. Esto lo fija.
#
# ## Dos trampas que este script evita
#
#  1. **Sin `@types/**` y `types/**` en el include salen falsos positivos** del
#     tipo `Property 'user' does not exist on type 'Request'`: las
#     augmentaciones de Express viven ahí, y un `include` estrecho las deja
#     fuera. Parecen errores reales y no lo son.
#  2. **`grep -c "error TS"` NO es un indicador de limpieza.** Sobre salida
#     vacía devuelve 0 igual que sobre "no hubo errores". Hay que mirar el exit
#     code de tsc, que es lo que hace este script.
#
# ## Uso
#
#   ./scripts/tsc-check.sh services/WbotServices/wbotMessageListener.ts
#   ./scripts/tsc-check.sh helpers/tenantScope.ts middleware/tokenAuth.ts
#   npm run type-check:files -- helpers/tenantScope.ts
#
# tsc arrastra el grafo de imports, así que el informe incluirá errores de
# ficheros que no pediste. Eso es esperado: el resumen agrupa por fichero para
# que se vea de un vistazo cuáles son tuyos y cuáles preexistentes.
#
# A 2026-07-29 la línea base del repo son **37 errores preexistentes** en
# controllers/WhatsAppController.ts (16), controllers/MessageController.ts (16),
# config/upload.ts (4) y middleware/isAuth.ts (1). Un fichero limpio es el que
# no aparece en el resumen.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$#" -eq 0 ]; then
  echo "Uso: $0 <fichero.ts> [fichero.ts ...]" >&2
  exit 64
fi

FILES_JSON=""
for f in "$@"; do
  abs="$f"
  [ "${abs#/}" = "$abs" ] && abs="$ROOT/$f"
  if [ ! -f "$abs" ]; then
    echo "No existe: $f" >&2
    exit 66
  fi
  FILES_JSON="$FILES_JSON    \"$abs\",
"
done

TMP_CFG="$(mktemp -t tsc-check-XXXXXX.json)"
trap 'rm -f "$TMP_CFG"' EXIT

cat > "$TMP_CFG" <<EOF
{
  "extends": "$ROOT/tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "include": [
$FILES_JSON    "$ROOT/@types/**/*.d.ts",
    "$ROOT/types/**/*.d.ts"
  ]
}
EOF

OUT="$(mktemp -t tsc-check-out-XXXXXX)"
trap 'rm -f "$TMP_CFG" "$OUT"' EXIT

npx tsc -p "$TMP_CFG" > "$OUT" 2>&1
STATUS=$?

if [ "$STATUS" -eq 0 ]; then
  echo "tsc OK — 0 errores en el grafo de $# fichero(s)."
  exit 0
fi

echo "tsc exit=$STATUS. Errores por fichero:"
grep "error TS" "$OUT" | sed 's/(.*//' | sort | uniq -c | sort -rn
echo
echo "--- detalle ---"
cat "$OUT"
exit "$STATUS"
