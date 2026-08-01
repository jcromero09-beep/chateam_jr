#!/usr/bin/env bash
#
# format-check-diff.sh — prettier SOLO sobre los ficheros que toca el cambio.
#
# ## Por qué no `format:check` a secas
#
# `npm run format:check` recorre el árbol entero y falla en **1.400 ficheros**: el
# repo nunca se formateó. Eso bloqueaba el job `lint` de CI, y con él `build`,
# `integration-tests` y los deploys, que declaran `needs: [lint, test]`. O sea:
# el pipeline entero llevaba parado en el primer paso.
#
# La salida obvia —`prettier --write` a todo— es un diff de 1.400 ficheros que
# arrasa el `git blame` del repo y hace que cualquier cambio real posterior se
# lea dentro de ese ruido. Decisión de JC (2026-07-29): **validar solo el diff**.
# El árbol converge solo según se van tocando ficheros, sin un commit bomba.
#
# ## Cómo elige los ficheros
#
#   - En un pull_request: contra la rama base (GITHUB_BASE_REF).
#   - En un push: contra el commit anterior.
#   - En local, sin nada de eso: contra el upstream de la rama, y si no hay,
#     contra HEAD~1.
#
# ## Alcance
#
# El MISMO que `npm run format:check`: `.ts`/`.tsx` bajo controllers, services,
# models, routes, middleware, helpers, utils y config. Ni más ni menos — ampliarlo
# a docs o JSON metería en la puerta ficheros que nunca estuvieron, y prettier
# reflowea el markdown de prosa, que es justo lo que no se quiere.
#
# Solo mira ficheros que EXISTEN (un borrado no se formatea).
#
# Uso:  ./scripts/format-check-diff.sh  [rango-git]
#       npm run format:check:diff

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "$#" -ge 1 ]; then
  RANGE="$1"
elif [ -n "${GITHUB_BASE_REF:-}" ]; then
  git fetch --no-tags --depth=1 origin "$GITHUB_BASE_REF" 2>/dev/null || true
  RANGE="origin/$GITHUB_BASE_REF...HEAD"
elif [ -n "${GITHUB_EVENT_BEFORE:-}" ] && [ "${GITHUB_EVENT_BEFORE}" != "0000000000000000000000000000000000000000" ]; then
  RANGE="${GITHUB_EVENT_BEFORE}...HEAD"
elif git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  RANGE="@{u}...HEAD"
else
  RANGE="HEAD~1...HEAD"
fi

echo "Rango: $RANGE"

# Mismos directorios y extensiones que el `format:check` de package.json.
mapfile -t FILES < <(
  git diff --name-only --diff-filter=ACMR "$RANGE" -- \
    'controllers/**/*.ts'  'controllers/**/*.tsx' \
    'services/**/*.ts'     'services/**/*.tsx' \
    'models/**/*.ts'       'models/**/*.tsx' \
    'routes/**/*.ts'       'routes/**/*.tsx' \
    'middleware/**/*.ts'   'middleware/**/*.tsx' \
    'helpers/**/*.ts'      'helpers/**/*.tsx' \
    'utils/**/*.ts'        'utils/**/*.tsx' \
    'config/**/*.ts'       'config/**/*.tsx' \
    2>/dev/null | while read -r f; do [ -f "$f" ] && echo "$f"; done
)

# ---------------------------------------------------------------------------
# Línea base de legado (ratchet: .prettier-legacy-baseline solo ENCOGE)
#
# Validar por fichero tiene un fallo en un repo con monolitos: tocar UNA línea de
# un fichero que nunca se formateó obligaría a reformatearlo entero, y ese diff se
# traga el cambio real — justo lo que se quería evitar al no correr `--write`
# sobre el árbol. Por eso los 1.400 que ya estaban sucios quedan congelados.
#
# Un fichero NUEVO, o uno que ya esté limpio, no está en la lista y por tanto SÍ
# tiene que pasar la puerta. Eso es lo que impide que la deuda crezca.
# ---------------------------------------------------------------------------
BASELINE="$ROOT/.prettier-legacy-baseline"

FILTERED=()
SKIPPED=()
for f in "${FILES[@]:-}"; do
  [ -z "$f" ] && continue
  if [ -f "$BASELINE" ] && grep -qxF "$f" "$BASELINE"; then
    SKIPPED+=("$f")
  else
    FILTERED+=("$f")
  fi
done
FILES=("${FILTERED[@]:-}")

if [ "${#SKIPPED[@]}" -gt 0 ]; then
  echo "${#SKIPPED[@]} exento(s) por la línea base de legado (.prettier-legacy-baseline)."
fi

if [ -z "${FILES[0]:-}" ]; then
  echo "Sin ficheros formateables en el diff — nada que validar."
  exit 0
fi

echo "${#FILES[@]} fichero(s) a validar."
npx prettier --check "${FILES[@]}"
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  cat >&2 <<'EOF'

Estos ficheros no están formateados. Arréglalos con:
    npx prettier --write <fichero>

Se valida SOLO lo que toca tu cambio, a propósito: el resto del árbol arrastra
deuda de formato histórica y no es tuya. No corras `prettier --write` sobre todo.
EOF
fi

exit "$STATUS"
