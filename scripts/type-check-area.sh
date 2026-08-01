#!/usr/bin/env bash
#
# type-check-area.sh — typecheck de UN área del backend, no del proyecto entero.
#
# ## Por qué existe
#
# `npm run type-check` (tsc sobre `**/*.ts`) no termina en máquinas con poca
# memoria: el grafo de tipos de un solo controller arrastra ~4.000 ficheros
# (googleapis 897, @redis 510, @sentry 330, speech-sdk 259, date-fns 258), y V8
# vuelca core al llegar a su heap por defecto. En CI se resuelve dándole 6 GB;
# en local, acotando el área.
#
# ## La trampa que este script existe para evitar
#
# Un `tsconfig` con `include` escrito a mano DEJA FUERA los `.d.ts` ambient, y con
# ellos las augmentaciones globales. El síntoma es un puñado de errores que NO
# EXISTEN: sin `@types/express.d.ts`, cada `req.user` del proyecto se reporta como
# `Property 'user' does not exist on type 'Request'`. Se perdieron horas dando esos
# 37 falsos positivos por "baseline preexistente" del proyecto.
#
# Por eso `@types/**/*.d.ts` va SIEMPRE en el include, antes que nada.
#
# Uso:
#   bash scripts/type-check-area.sh models
#   bash scripts/type-check-area.sh services/WbotServices
#   bash scripts/type-check-area.sh controllers/ApiController.ts   # también un fichero
#
# Exit 0 si no hay errores en el área. El typecheck es del ÁREA: los ficheros de
# fuera se cargan como dependencia pero sus errores no se reportan.
set -uo pipefail

AREA="${1:-}"
if [ -z "$AREA" ]; then
  echo "Uso: bash scripts/type-check-area.sh <carpeta|fichero>"
  echo "Ej.: bash scripts/type-check-area.sh models"
  exit 2
fi

cd "$(dirname "$0")/.." || exit 2

if [ ! -e "$AREA" ]; then
  echo "No existe: $AREA"
  exit 2
fi

# Carpeta -> glob recursivo; fichero -> tal cual.
if [ -d "$AREA" ]; then
  TARGET="${AREA%/}/**/*.ts"
else
  TARGET="$AREA"
fi

CFG="tsconfig.area.$$.json"
cleanup() { rm -f "$CFG"; }
trap cleanup EXIT

cat > "$CFG" <<EOF
{
  "extends": "./tsconfig.json",
  "include": [
    "@types/**/*.d.ts",
    "$TARGET"
  ]
}
EOF

echo "type-check-area: $TARGET (+ @types/**/*.d.ts)"
NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}" npx tsc --noEmit -p "$CFG"
STATUS=$?

# OJO: un `| grep -c "error TS"` sobre un tsc que murió por OOM devuelve 0 y se
# lee como "limpio". El exit code es el único dato fiable.
if [ "$STATUS" -eq 0 ]; then
  echo "OK: sin errores de tipos en $AREA"
elif [ "$STATUS" -ge 130 ]; then
  echo "ABORTADO (exit $STATUS): probablemente OOM. NO es 'limpio'. Acota más el área"
  echo "         o sube NODE_OPTIONS=--max-old-space-size=…"
else
  echo "FAIL (exit $STATUS): hay errores de tipos en $AREA"
fi
exit $STATUS
