#!/usr/bin/env bash
#
# any-ratchet (Ola 5) — trinquete de tipado. NO fuerza arreglar los `any` existentes
# (fix masivo arriesgado), pero FALLA si el conteo AUMENTA en PRODUCCION -> evita que
# entre `any` nuevo. Bajar el BASELINE a medida que se limpian tipos.
#
# Uso:   bash scripts/any-ratchet.sh
# CI:    exit 1 bloquea el merge si crece el conteo de produccion.
#
# ## Tres cosas que hay que saber para recalibrarlo sin romperlo
#
# 1. UNIDAD: ocurrencias, no lineas. El gate cuenta con `grep -o`, o sea un match por
#    ocurrencia; una linea con dos `any` suma 2. Un BASELINE fijado con `grep` SIN `-o`
#    (que cuenta lineas) sale mas bajo y el gate no puede pasar nunca.
#
# 2. HERRAMIENTA: `grep` de verdad. Algunos entornos interactivos alias-an `grep` a
#    ugrep con `--ignore-files`, que respeta .gitignore y por tanto NO ve `dist/` ni
#    otros directorios ignorados. Medir con esa variante da un numero distinto del que
#    obtiene este script cuando corre en CI. Diferencia observada el 2026-07-31: 4.289
#    (grep real) frente a 4.330 (ugrep).
#
# 3. ORIGEN: el numero se lee de la salida de ESTE script. Nunca se mide a mano por
#    fuera. Historia de por que: BASELINE=4048 se escribio el 2026-07-17 y ese mismo
#    dia el script media 4.152 ocurrencias (4.019 lineas). No coincide con NINGUNA
#    medicion reproducible, asi que el gate llevaba fallando en CI desde el dia que se
#    creo — por el numero escrito, no por `any` nuevos.
#
# ## Por que produccion y tests van separados
#
# Un test de characterization contra modelos Sequelize necesita `as any` para leer
# `.id` de una instancia; es idiomatico y no es la deuda que este gate quiere frenar.
# Con un unico contador, anadir golden-masters obligaba a subir el BASELINE, y un
# trinquete que se afloja cada vez que estorba deja de serlo — y de paso se llevaba
# por delante el margen de produccion. Los tests se reportan pero no bloquean.
set -uo pipefail

# Recalibrado el 2026-07-31 con la salida de este mismo script.
BASELINE_PROD=3740
# Informativo. Si se quisiera trincar tambien los tests, aqui esta el numero.
# [2026-08-02] +11 con tenantScopeApi.dbtest.ts y la red de la API pública.
BASELINE_TESTS=642

cd "$(dirname "$0")/.." || exit 2

PATRON=":\s*any\b|as any\b|<any>|any\[\]"
EXCL="node_modules|_cuarentena|/frontend/|\.d\.ts"

TODO=$(grep -rEo "$PATRON" --include=*.ts . 2>/dev/null | grep -vE "$EXCL")

CURRENT_PROD=$(printf '%s\n' "$TODO" | grep -vE "/tests/" | grep -c . | tr -d ' ')
CURRENT_TESTS=$(printf '%s\n' "$TODO" | grep -cE "/tests/" | tr -d ' ')

echo "any-ratchet · produccion: baseline=$BASELINE_PROD  actual=$CURRENT_PROD"
echo "any-ratchet · tests:      baseline=$BASELINE_TESTS  actual=$CURRENT_TESTS  (informativo)"

if [ "$CURRENT_TESTS" -gt "$BASELINE_TESTS" ]; then
  echo "nota: +$((CURRENT_TESTS - BASELINE_TESTS)) 'any' en tests. No bloquea; actualiza"
  echo "      BASELINE_TESTS=$CURRENT_TESTS cuando el numero se estabilice."
fi

if [ "$CURRENT_PROD" -gt "$BASELINE_PROD" ]; then
  echo "FAIL: el conteo de 'any' en PRODUCCION aumento (+$((CURRENT_PROD - BASELINE_PROD)))."
  echo "      No introducir 'any' nuevo en codigo de produccion."
  exit 1
fi

if [ "$CURRENT_PROD" -lt "$BASELINE_PROD" ]; then
  DELTA=$((BASELINE_PROD - CURRENT_PROD))
  echo "OK: produccion bajo ($DELTA menos). Actualiza BASELINE_PROD=$CURRENT_PROD para trincarlo."
  # Un trinquete que no se aprieta deja de ser trinquete: si la holgura crece, avisa
  # fuerte para que la bajada quede fijada y no se pueda volver a gastar.
  if [ "$DELTA" -ge 50 ]; then
    echo "AVISO: hay $DELTA de holgura acumulada. Fijala YA (BASELINE_PROD=$CURRENT_PROD)"
    echo "       o el trinquete permite volver a subir hasta $BASELINE_PROD sin fallar."
  fi
else
  echo "OK: sin 'any' nuevo en produccion."
fi
exit 0
