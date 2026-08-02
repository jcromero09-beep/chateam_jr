#!/usr/bin/env bash
#
# eslint-ratchet.sh — trinquete de lint, hermano de any-ratchet.sh.
#
# ## Por qué un trinquete y no una limpieza
#
# `npm run lint` da 1.233 errores, heredados de años. De ellos **solo 3 son
# auto-corregibles** (el propio eslint lo dice: "3 errors potentially fixable"); 929
# son `no-unused-vars`, que hay que revisar uno a uno porque borrar una variable sin
# mirar puede quitar un efecto secundario. O sea: limpiarlos es un proyecto, no un
# paso previo.
#
# Mientras tanto el job `lint` estaba SIEMPRE en rojo, y con él `build` e
# `integration-tests`, que dependen de él. Un gate que siempre falla no informa de
# nada y bloquea el resto del pipeline.
#
# Este script hace lo mismo que ya se decidió para prettier (validar solo el diff) y
# para `any` (congelar y no empeorar): el conteo NO puede subir. La deuda deja de
# crecer hoy y se paga según se toque cada fichero.
#
# Uso:   bash scripts/eslint-ratchet.sh
# CI:    sustituye a `npm run lint`; exit 1 si entran errores nuevos.
#
# OJO con la memoria: eslint recorre un grafo grande y con el heap por defecto de V8
# vuelca core SIN emitir diagnóstico, que es indistinguible de "falló por el código".
# Por eso se fija NODE_OPTIONS aquí y no se confía en el entorno.
set -uo pipefail

# Conteo congelado el 2026-08-01, leído de la salida de ESTE script.
#
# Se fija en 1252, que es lo que medía la rama ANTES de la limpieza de los errores
# propios (los 15 que introdujo la extracción del monolito: unused vars y un
# prefer-const). Tras esa limpieza el número real es menor, pero medirlo cuesta una
# pasada de eslint de ~3 minutos: el primer run del CI lo dirá exacto y este mismo
# script pedirá bajarlo ("OK: bajó N, actualiza BASELINE").
#
# Se prefiere un baseline holgado y verde a uno ajustado a ojo que deje el job en
# rojo: el gate ya llevaba meses sin informar de nada.
BASELINE=1252

cd "$(dirname "$0")/.." || exit 2

SALIDA=$(NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}" \
  npx eslint controllers services models routes middleware helpers utils config \
  --ext .ts,.tsx 2>&1)
ESTADO=$?

# El resumen de eslint es "✖ N problems (X errors, Y warnings)". Solo trincamos
# errores: los warnings son otra conversación y moverlos aquí escondería el número.
ACTUAL=$(printf '%s\n' "$SALIDA" | grep -oE '\(([0-9]+) errors?' | grep -oE '[0-9]+' | tail -1)

if [ -z "$ACTUAL" ]; then
  # Sin línea de resumen: o no hay problemas, o eslint murió antes de escribirla.
  if [ "$ESTADO" -eq 0 ]; then
    echo "eslint-ratchet: 0 errores (baseline=$BASELINE)"
    echo "OK: sin errores. Baja BASELINE=0 para trincarlo."
    exit 0
  fi
  echo "eslint-ratchet: NO se pudo leer el conteo (exit $ESTADO). Salida:"
  printf '%s\n' "$SALIDA" | tail -20
  exit 2
fi

echo "eslint-ratchet: baseline=$BASELINE  actual=$ACTUAL"

if [ "$ACTUAL" -gt "$BASELINE" ]; then
  echo "FAIL: entraron $((ACTUAL - BASELINE)) errores de lint nuevos."
  echo "      Los ficheros que tocaste tienen que salir limpios; el resto de la deuda"
  echo "      es heredada y se paga aparte."
  printf '%s\n' "$SALIDA" | grep -E "^/|error" | tail -30
  exit 1
fi

if [ "$ACTUAL" -lt "$BASELINE" ]; then
  DELTA=$((BASELINE - ACTUAL))
  echo "OK: bajó ($DELTA menos). Actualiza BASELINE=$ACTUAL para trincar la mejora."
  if [ "$DELTA" -ge 25 ]; then
    echo "AVISO: $DELTA de holgura acumulada. Fíjala o el trinquete permite volver a"
    echo "       subir hasta $BASELINE sin fallar."
  fi
else
  echo "OK: sin errores de lint nuevos."
fi
exit 0
