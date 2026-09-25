#!/usr/bin/env python3
"""
run_tests.py — runner ÚNICO de todas las suites de `docs/` (visión clásica, sin AGPL).

Descubre cada `docs/<paquete>/test_*.py` y lo ejecuta EN SU PROPIO directorio (cada suite hace
`sys.path.insert(0, dirname)` para importar sus módulos hermanos), en un subproceso aislado. Así
un fallo de import en un paquete no tumba al resto. Reporta por paquete y un total, y termina con
código != 0 si algo falla (apto para un gate de CI).

Uso:
    python run_tests.py                 # todo
    python run_tests.py audio forensic  # solo esos paquetes
    python run_tests.py -q               # silencioso (solo resumen)
    python run_tests.py --list           # lista lo que correría, sin ejecutar

No hace builds, migraciones ni red: solo corre pruebas de Python con señales sintéticas.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import time

DOCS = os.path.dirname(os.path.abspath(__file__))
_RAN = re.compile(r"Ran (\d+) test")


def discover(only) -> dict:
    """Devuelve {paquete: [rutas de test_*.py]} ordenado."""
    out = {}
    for entry in sorted(os.listdir(DOCS)):
        pkg = os.path.join(DOCS, entry)
        if not os.path.isdir(pkg):
            continue
        if only and entry not in only:
            continue
        tests = sorted(f for f in os.listdir(pkg)
                       if f.startswith("test_") and f.endswith(".py"))
        if tests:
            out[entry] = [os.path.join(pkg, t) for t in tests]
    return out


def run_file(path: str) -> tuple[bool, int, str]:
    """Ejecuta un test_*.py en su directorio. Devuelve (ok, n_tests, cola_de_salida)."""
    pkg_dir = os.path.dirname(path)
    proc = subprocess.run([sys.executable, os.path.basename(path)],
                          cwd=pkg_dir, capture_output=True, text=True)
    output = proc.stdout + proc.stderr
    n = 0
    m = _RAN.search(output)
    if m:
        n = int(m.group(1))
    ok = proc.returncode == 0
    tail = "\n".join(output.strip().splitlines()[-8:])
    return ok, n, tail


def main() -> int:
    ap = argparse.ArgumentParser(description="Runner único de las suites de docs/.")
    ap.add_argument("packages", nargs="*", help="paquetes a correr (por defecto: todos)")
    ap.add_argument("-q", "--quiet", action="store_true", help="solo el resumen")
    ap.add_argument("--list", action="store_true", help="lista sin ejecutar")
    args = ap.parse_args()

    suites = discover(set(args.packages))
    if not suites:
        print("No se encontraron suites (docs/<paquete>/test_*.py).")
        return 1

    if args.list:
        for pkg, files in suites.items():
            print(f"{pkg}: {len(files)} archivos")
            for f in files:
                print(f"  - {os.path.basename(f)}")
        return 0

    t0 = time.time()
    total_tests = total_files = failed_files = 0
    failures = []

    for pkg, files in suites.items():
        pkg_tests = pkg_fail = 0
        for f in files:
            ok, n, tail = run_file(f)
            total_files += 1
            pkg_tests += n
            total_tests += n
            if not ok:
                failed_files += 1
                pkg_fail += 1
                failures.append((os.path.relpath(f, DOCS), tail))
        status = "OK  " if pkg_fail == 0 else f"FAIL({pkg_fail})"
        if not args.quiet or pkg_fail:
            print(f"[{status}] {pkg:<14} {len(files):>2} archivos · {pkg_tests:>3} pruebas")

    dt = time.time() - t0
    print("-" * 60)
    print(f"TOTAL: {total_tests} pruebas en {total_files} archivos · "
          f"{failed_files} archivo(s) con fallos · {dt:.1f}s")

    if failures:
        print("\n== Fallos ==")
        for rel, tail in failures:
            print(f"\n--- {rel} ---\n{tail}")
        return 1
    print("Todo verde ✔")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
