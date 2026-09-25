#!/usr/bin/env bash
# ci-gate.sh — gate liviano de los módulos de visión clásica de docs/ (sin AGPL, sin red).
#
# Corre TODAS las suites (docs/<paquete>/test_*.py) con el runner único y falla (exit!=0) si
# alguna prueba falla — apto para CI o pre-commit. NO hace builds, migraciones ni despliegues;
# solo pruebas de Python con señales/imágenes sintéticas (ver AGENTS.md §4).
#
# Uso:   bash docs/ci-gate.sh            # todo
#        bash docs/ci-gate.sh audio forensic
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON:-python3}"
echo "== ci-gate: suites de visión clásica (docs/) =="
"$PY" "$HERE/run_tests.py" "$@"
