#!/usr/bin/env bash
#
# any-ratchet (Ola 5) — trinquete de tipado. NO fuerza arreglar los ~4089 `any`
# existentes (fix masivo arriesgado), pero FALLA si el conteo AUMENTA -> evita que
# entre `any` nuevo. Bajar el BASELINE a medida que se limpian tipos.
#
# Uso:   bash scripts/any-ratchet.sh
# CI:    anadir como step; exit 1 bloquea el merge si crece el conteo.
#
set -uo pipefail

# Conteo congelado el 2026-07-17 (backend, excluye node_modules/_cuarentena/frontend/.d.ts).
BASELINE=4048

cd "$(dirname "$0")/.." || exit 2

CURRENT=$(grep -rEo ":\s*any\b|as any\b|<any>|any\[\]" --include=*.ts . 2>/dev/null \
  | grep -vE "node_modules|_cuarentena|/frontend/|\.d\.ts" | wc -l | tr -d ' ')

echo "any-ratchet: baseline=$BASELINE  actual=$CURRENT"

if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo "FAIL: el conteo de 'any' AUMENTO (+$((CURRENT - BASELINE))). No introducir 'any' nuevo."
  exit 1
fi
if [ "$CURRENT" -lt "$BASELINE" ]; then
  echo "OK: bajo ($((BASELINE - CURRENT)) menos). Actualiza BASELINE=$CURRENT para trincar la mejora."
else
  echo "OK: sin 'any' nuevo."
fi
exit 0
