"""
sherlock_checker.py — adaptador que envuelve Sherlock (MIT) como `checker` del contrato OSINT.

Convierte la salida de Sherlock en la lista `[{"site","url","status","method"}]` que consume
`osint_enrichment`. NO reimplementa Sherlock: lo invoca por subproceso y parsea su salida. El
parseo es puro y se prueba SIN red ni Sherlock (se inyecta un `runner` falso).

⚠️ SEGURO POR DEFECTO: `enable_network=False`. Con la red desactivada el checker NO ejecuta nada y
lanza `NetworkDisabled` (que el contrato registra como hit 'error'), así nunca sale a Internet por
accidente. Para consultar de verdad hay que:
  1) instalar Sherlock (`pipx install sherlock-project`), 2) `enable_network=True`, y
  3) que la POLÍTICA DE RED del entorno lo permita (en el NAS, salida saliente).
Cada corrida real toca ~400 sitios: respeta sus ToS, límites de tasa y la base legal (el contrato
ya exige `legal_basis`). Prefiere un subconjunto de sitios y `--timeout`.
"""

from __future__ import annotations

import re
import shutil
import subprocess

# "[+] GitHub: https://github.com/alice"  (Sherlock imprime así los encontrados con --print-found)
_FOUND_RE = re.compile(r"^\[\+\]\s*([^:]+):\s*(\S+)")


class NetworkDisabled(RuntimeError):
    """El checker se invocó con la red desactivada (enable_network=False)."""


def sherlock_available(cmd: str = "sherlock") -> bool:
    """True si el ejecutable de Sherlock está en el PATH."""
    return shutil.which(cmd) is not None


def parse_sherlock_stdout(text: str) -> list:
    """Parsea la salida `--print-found` de Sherlock -> [{"site","url","status","method"}].

    Puro y determinista: es lo que se prueba. Solo cuenta líneas de 'encontrado' (`[+]`).
    """
    hits = []
    for line in (text or "").splitlines():
        m = _FOUND_RE.match(line.strip())
        if m:
            site, url = m.group(1).strip(), m.group(2).strip()
            hits.append({"site": site, "url": url, "status": "claimed", "method": "sherlock"})
    return hits


def _default_runner(cmd, timeout):
    """Ejecuta el subproceso real. Devuelve (returncode, stdout, stderr)."""
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return p.returncode, p.stdout, p.stderr


def build_sherlock_checker(*, enable_network: bool = False, timeout: int = 60,
                           sites=None, extra_args=(), sherlock_cmd: str = "sherlock",
                           runner=None):
    """Devuelve un `checker(username) -> list` compatible con `osint_enrichment`.

    - `enable_network=False` (por defecto): el checker lanza `NetworkDisabled` sin ejecutar nada.
    - `sites`: lista opcional de sitios a consultar (Sherlock `--site S`), para limitar el alcance.
    - `runner`: inyectable `(cmd, timeout) -> (rc, stdout, stderr)`; por defecto, subproceso real.
      En pruebas se inyecta uno falso, así NO se necesita Sherlock ni red.
    """
    run = runner or _default_runner
    sites = list(sites or [])

    def checker(username: str) -> list:
        if not enable_network:
            raise NetworkDisabled(
                "red desactivada: enable_network=True + Sherlock instalado + política de red "
                "del entorno que permita salida")
        cmd = [sherlock_cmd, username, "--print-found", "--no-color", "--timeout", str(timeout)]
        for s in sites:
            cmd += ["--site", s]
        cmd += list(extra_args)
        try:
            _rc, out, _err = run(cmd, timeout)
        except FileNotFoundError as e:                 # Sherlock no instalado
            raise NetworkDisabled(f"sherlock no encontrado: {e}") from e
        return parse_sherlock_stdout(out)

    return checker


if __name__ == "__main__":
    import argparse
    from osint_enrichment import IdentifierQuery, enrich_identifiers, dry_run_checker

    ap = argparse.ArgumentParser(description="OSINT por alias vía Sherlock (seguro por defecto).")
    ap.add_argument("usernames", nargs="+")
    ap.add_argument("--legal-basis", required=True, help="base legal de la consulta (obligatoria)")
    ap.add_argument("--enable-network", action="store_true",
                    help="ejecuta Sherlock de verdad (requiere instalación + política de red)")
    ap.add_argument("--site", action="append", default=[], help="limitar a estos sitios")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    queries = [IdentifierQuery(u, source="investigator") for u in args.usernames]
    if args.enable_network:
        checker = build_sherlock_checker(enable_network=True, sites=args.site)
        rep = enrich_identifiers(queries, checker, legal_basis=args.legal_basis, out_dir=args.out,
                                 checker_name="sherlock")
    else:
        # sin red: plan de consulta (dry-run) usando los sitios dados (o ninguno)
        sites = [{"name": s, "url": ""} for s in args.site]
        rep = enrich_identifiers(queries, dry_run_checker(sites), legal_basis=args.legal_basis,
                                 dry_run=True, out_dir=args.out, checker_name="dry_run")
    import json
    print(json.dumps({"n": rep["manifest"]["n_identifiers"], "dry_run": rep["manifest"]["dry_run"],
                      "checker": rep["manifest"]["checker"]}, indent=2))
