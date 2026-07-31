#!/usr/bin/env bash
#
# any-ratchet (Ola 5) — trinquete de tipado. NO fuerza arreglar los `any` existentes
# (fix masivo arriesgado), pero FALLA si el conteo AUMENTA -> evita que entre `any`
# nuevo. Bajar el BASELINE a medida que se limpian tipos.
#
# Uso:   bash scripts/any-ratchet.sh
# CI:    anadir como step; exit 1 bloquea el merge si crece el conteo.
#
# ## La unidad importa: OCURRENCIAS, no lineas
#
# El gate cuenta con `grep -o`, o sea **una ocurrencia por match**. Una linea con dos
# `any` suma 2. Si el BASELINE se fija con un `grep` SIN `-o` (que cuenta lineas) sale
# un numero mas bajo y el gate no puede pasar nunca.
#
# Eso paso: BASELINE=4048 se fijo el 2026-07-17 contando lineas (ese dia eran 4.059
# lineas / 4.193 ocurrencias). El gate llevaba desde entonces fallando en CI por una
# discrepancia de unidad, no por `any` nuevos: la deriva real en dos semanas fue +66.
#
# Por eso la unica forma correcta de recalibrar es leer el `actual=N` que imprime
# ESTE script y copiarlo. Nunca medir a mano por fuera.
set -uo pipefail

# Recalibrado el 2026-07-31 con la salida de este mismo script (ocurrencias).
# Verificado: el refactor del wbot de ese dia BAJO el conteo en los ficheros tocados
# (127 -> 123), asi que este numero ya incluye esa mejora.
BASELINE=4259

cd "$(dirname "$0")/.." || exit 2

CURRENT=$(grep -rEo ":\s*any\b|as any\b|<any>|any\[\]" --include=*.ts . 2>/dev/null \
  | grep -vE "node_modules|_cuarentena|/frontend/|\.d\.ts" | wc -l | tr -d ' ')

echo "any-ratchet: baseline=$BASELINE  actual=$CURRENT"

if [ "$CURRENT" -gt "$BASELINE" ]; then
  echo "FAIL: el conteo de 'any' AUMENTO (+$((CURRENT - BASELINE))). No introducir 'any' nuevo."
  exit 1
fi
if [ "$CURRENT" -lt "$BASELINE" ]; then
  DELTA=$((BASELINE - CURRENT))
  echo "OK: bajo ($DELTA menos). Actualiza BASELINE=$CURRENT para trincar la mejora."
  # Un trinquete que no se aprieta deja de ser trinquete: si la holgura crece, avisa
  # fuerte para que la bajada quede fijada y no se pueda volver a gastar.
  if [ "$DELTA" -ge 50 ]; then
    echo "AVISO: hay $DELTA de holgura acumulada. Fijala YA (BASELINE=$CURRENT) o el"
    echo "       trinquete permite volver a subir hasta $BASELINE sin fallar."
  fi
else
  echo "OK: sin 'any' nuevo."
fi
exit 0
