#!/usr/bin/env python3
"""
cam_discovery.py — descubrimiento inicial de cámaras para el instalador (uso autorizado).

Enumera endpoints de cámara en una subred del cliente y marca las que responden con credenciales
de fábrica, para el ALTA de una instalación. NO es parte del producto en marcha: es una herramienta
de campo, de una sola pasada, que se corre SOLO contra redes que el cliente autorice por escrito.

Inspirado en la idea de CamSniff (MIT), reescrito acotado y en Python + stdlib:
  * barrido de puertos típicos de cámara (RTSP/ONVIF/HTTP) por sockets, sin Nmap ni Masscan;
  * comprobación de credenciales de fábrica LIMITADA (lista corta, corte al primer acierto por host);
  * validación de que el stream entrega vídeo real con ffprobe (si está disponible);
  * salida JSON estructurada + reporte legible, con hallazgos de seguridad (credencial débil).

Salvaguardas:
  * exige --i-am-authorized y un rango privado (RFC1918) salvo --allow-public;
  * concurrencia y timeouts acotados; sin reintentos agresivos;
  * nunca escribe en las cámaras; solo lee.

Uso:
    python cam_discovery.py 192.168.1.0/24 --i-am-authorized --out alta_cliente.json
    python cam_discovery.py 10.0.0.10-10.0.0.60 --i-am-authorized --creds creds.txt
"""

from __future__ import annotations

import argparse
import concurrent.futures
import ipaddress
import json
import shutil
import socket
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

# Puertos típicos por servicio (no exhaustivo; el instalador puede ampliar con --ports)
DEFAULT_PORTS = {
    "rtsp": [554, 8554, 10554],
    "onvif": [80, 8000, 8899, 2020, 8080],
    "http": [80, 8080, 443],
}

# Rutas RTSP de fabricante más comunes. {u},{p} se rellenan con las credenciales probadas.
VENDOR_RTSP_PATHS = {
    "dahua/xvr":   ["/cam/realmonitor?channel=1&subtype=1", "/cam/realmonitor?channel=1&subtype=0"],
    "hikvision":   ["/Streaming/Channels/102", "/Streaming/Channels/101", "/h264/ch1/sub/av_stream"],
    "axis":        ["/axis-media/media.amp"],
    "reolink":     ["/h264Preview_01_sub", "/h264Preview_01_main"],
    "generic":     ["/live", "/live/ch0", "/11", "/stream1", "/Streaming/Channels/1"],
}

# Credenciales de fábrica. Lista CORTA a propósito: esto detecta descuido del instalador
# anterior, no rompe cámaras. Ampliable por archivo con --creds, bajo autorización.
DEFAULT_CREDS = [
    ("admin", "admin"), ("admin", ""), ("admin", "12345"), ("admin", "123456"),
    ("admin", "password"), ("root", "root"), ("root", "12345"), ("admin", "9999"),
]


@dataclass
class Finding:
    host: str
    open_ports: list[int] = field(default_factory=list)
    services: list[str] = field(default_factory=list)
    vendor_guess: str = "unknown"
    rtsp_url: str | None = None          # URL validada (con credencial si hizo falta)
    stream_ok: bool = False
    codec: str | None = None
    weak_credential: bool = False        # HALLAZGO DE SEGURIDAD: entró con credencial de fábrica
    credential_used: str | None = None   # "usuario:****" enmascarado
    notes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Parseo de objetivos
# ---------------------------------------------------------------------------


def parse_targets(spec: str) -> list[str]:
    """Acepta CIDR (192.168.1.0/24), rango (a-b) o IP suelta. Devuelve lista de IPs."""
    spec = spec.strip()
    if "/" in spec:
        net = ipaddress.ip_network(spec, strict=False)
        if net.num_addresses > 65536:
            raise ValueError("rango demasiado grande (>65536); acota la subred")
        return [str(h) for h in net.hosts()]
    if "-" in spec:
        a, b = spec.split("-", 1)
        start = ipaddress.ip_address(a.strip())
        end = ipaddress.ip_address(b.strip())
        if int(end) < int(start) or int(end) - int(start) > 65536:
            raise ValueError("rango inválido o demasiado grande")
        return [str(ipaddress.ip_address(i)) for i in range(int(start), int(end) + 1)]
    return [str(ipaddress.ip_address(spec))]


def is_private(ip: str) -> bool:
    return ipaddress.ip_address(ip).is_private


def build_rtsp_url(host: str, port: int, path: str, user: str | None = None, pwd: str | None = None) -> str:
    auth = f"{user}:{pwd}@" if user is not None else ""
    sep = "" if path.startswith("/") else "/"
    return f"rtsp://{auth}{host}:{port}{sep}{path}"


def mask_credential(user: str, pwd: str) -> str:
    return f"{user}:{'*' * max(1, len(pwd)) if pwd else '(vacío)'}"


# ---------------------------------------------------------------------------
# Sondas de red
# ---------------------------------------------------------------------------


def probe_port(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def classify_services(open_ports: list[int]) -> list[str]:
    svc = []
    for name, ports in DEFAULT_PORTS.items():
        if any(p in open_ports for p in ports):
            svc.append(name)
    return svc


def grab_http_banner(host: str, port: int, timeout: float = 1.5) -> str:
    """Lee cabeceras/cuerpo corto de la raíz HTTP para inferir fabricante. Solo lectura."""
    try:
        with socket.create_connection((host, port), timeout=timeout) as s:
            s.sendall(f"GET / HTTP/1.0\r\nHost: {host}\r\n\r\n".encode())
            data = s.recv(2048)
        return data.decode("latin-1", "ignore").lower()
    except OSError:
        return ""


def guess_vendor(banner: str) -> str:
    for vendor, needles in {
        "hikvision": ["hikvision", "web components", "/doc/page/login"],
        "dahua/xvr": ["dahua", "webrtc.js", "/rpcapi", "realmonitor"],
        "axis": ["axis", "vapix"],
        "reolink": ["reolink"],
    }.items():
        if any(n in banner for n in needles):
            return vendor
    return "unknown"


# ---------------------------------------------------------------------------
# Validación de stream con ffprobe (opcional)
# ---------------------------------------------------------------------------


def _have_ffprobe() -> bool:
    return shutil.which("ffprobe") is not None


def validate_stream(url: str, timeout: float = 6.0) -> tuple[bool, str | None]:
    """True + codec si el stream entrega vídeo. Requiere ffprobe; si no está, devuelve (False, None)."""
    if not _have_ffprobe():
        return False, None
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-rtsp_transport", "tcp",
             "-select_streams", "v:0", "-show_entries", "stream=codec_name",
             "-of", "default=nw=1:nk=1", url],
            capture_output=True, text=True, timeout=timeout + 2,
        )
        codec = out.stdout.strip().splitlines()[0] if out.stdout.strip() else None
        return (codec is not None), codec
    except (subprocess.TimeoutExpired, OSError):
        return False, None


# ---------------------------------------------------------------------------
# Escaneo de un host
# ---------------------------------------------------------------------------


def scan_host(host: str, ports: dict[str, list[int]], creds: list[tuple[str, str]],
              try_creds: bool, do_validate: bool, port_timeout: float = 1.0) -> Finding | None:
    all_ports = sorted({p for lst in ports.values() for p in lst})
    open_ports = [p for p in all_ports if probe_port(host, p, port_timeout)]
    if not open_ports:
        return None

    f = Finding(host=host, open_ports=open_ports, services=classify_services(open_ports))

    banner = ""
    for hp in ports.get("http", []):
        if hp in open_ports:
            banner = grab_http_banner(host, hp)
            if banner:
                break
    f.vendor_guess = guess_vendor(banner)

    rtsp_ports = [p for p in ports.get("rtsp", []) if p in open_ports]
    if not rtsp_ports:
        f.notes.append("puertos abiertos pero sin RTSP; revisar ONVIF/HTTP manualmente")
        return f

    paths = VENDOR_RTSP_PATHS.get(f.vendor_guess, []) + VENDOR_RTSP_PATHS["generic"]
    rport = rtsp_ports[0]

    # 1) ¿Abre sin credenciales? (cámara mal configurada o stream público)
    for path in paths:
        url = build_rtsp_url(host, rport, path)
        if do_validate:
            ok, codec = validate_stream(url)
            if ok:
                f.rtsp_url, f.stream_ok, f.codec = url, True, codec
                f.notes.append("stream accesible sin autenticación")
                return f
    # 2) Credenciales de fábrica (acotado, corte al primer acierto)
    if try_creds:
        for user, pwd in creds:
            matched = False
            for path in paths:
                url = build_rtsp_url(host, rport, path, user, pwd)
                if do_validate:
                    ok, codec = validate_stream(url)
                    if ok:
                        f.rtsp_url, f.stream_ok, f.codec = url, True, codec
                        f.weak_credential = True
                        f.credential_used = mask_credential(user, pwd)
                        f.notes.append("HALLAZGO: acceso con credencial de fábrica; cambiarla y aislar el XVR")
                        matched = True
                        break
            if matched:
                break
    if not do_validate:
        f.notes.append("ffprobe no disponible: RTSP abierto pero sin validar (instalar ffmpeg)")
    return f


# ---------------------------------------------------------------------------
# Orquestación
# ---------------------------------------------------------------------------


def run_scan(targets: list[str], ports: dict[str, list[int]], creds: list[tuple[str, str]],
             try_creds: bool, do_validate: bool, workers: int = 32) -> list[Finding]:
    results: list[Finding] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(scan_host, h, ports, creds, try_creds, do_validate): h for h in targets}
        for fut in concurrent.futures.as_completed(futs):
            f = fut.result()
            if f is not None:
                results.append(f)
    results.sort(key=lambda x: ipaddress.ip_address(x.host))
    return results


def build_report(findings: list[Finding], target_spec: str) -> dict:
    weak = [f for f in findings if f.weak_credential]
    return {
        "schema": "cam_discovery/1",
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "target": target_spec,
        "summary": {
            "hostsWithOpenPorts": len(findings),
            "streamsValidated": sum(1 for f in findings if f.stream_ok),
            "weakCredentials": len(weak),
            "vendors": sorted({f.vendor_guess for f in findings}),
        },
        "securityFindings": [
            {"host": f.host, "credential": f.credential_used, "vendor": f.vendor_guess,
             "action": "cambiar credencial de fábrica y colocar el XVR detrás de la tailnet"}
            for f in weak
        ],
        "cameras": [asdict(f) for f in findings],
    }


def render_text(report: dict) -> str:
    s = report["summary"]
    lines = [
        f"Descubrimiento de cámaras — {report['target']} — {report['generatedAt']}",
        f"  Hosts con puertos de cámara abiertos : {s['hostsWithOpenPorts']}",
        f"  Streams validados con vídeo          : {s['streamsValidated']}",
        f"  Credenciales de fábrica (HALLAZGO)   : {s['weakCredentials']}",
        f"  Fabricantes detectados               : {', '.join(s['vendors']) or '-'}",
        "",
    ]
    for f in report["cameras"]:
        flag = "  [!] CREDENCIAL DEBIL" if f["weak_credential"] else ""
        codec = f" [{f['codec']}]" if f["codec"] else ""
        lines.append(f"  {f['host']:<15} {f['vendor_guess']:<12} puertos={f['open_ports']}{codec}{flag}")
        for n in f["notes"]:
            lines.append(f"       - {n}")
    return "\n".join(lines)


def load_creds(path: str | None) -> list[tuple[str, str]]:
    if not path:
        return DEFAULT_CREDS
    creds = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            user, _, pwd = line.partition(":")
            creds.append((user, pwd))
    return creds or DEFAULT_CREDS


def parse_ports_arg(spec: str | None) -> dict[str, list[int]]:
    if not spec:
        return DEFAULT_PORTS
    extra = [int(p) for p in spec.split(",") if p.strip().isdigit()]
    ports = {k: list(v) for k, v in DEFAULT_PORTS.items()}
    ports["rtsp"] = sorted(set(ports["rtsp"]) | set(extra))
    return ports


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Descubrimiento inicial de cámaras (uso autorizado).")
    ap.add_argument("target", help="CIDR (192.168.1.0/24), rango (a-b) o IP")
    ap.add_argument("--i-am-authorized", action="store_true",
                    help="confirmas autorización escrita del cliente para escanear esta red")
    ap.add_argument("--allow-public", action="store_true", help="permitir IPs públicas (por defecto solo RFC1918)")
    ap.add_argument("--no-creds", action="store_true", help="no comprobar credenciales de fábrica")
    ap.add_argument("--no-validate", action="store_true", help="no validar streams con ffprobe")
    ap.add_argument("--creds", help="archivo usuario:clave por línea")
    ap.add_argument("--ports", help="puertos RTSP extra, coma-separados")
    ap.add_argument("--workers", type=int, default=32)
    ap.add_argument("--out", help="ruta del JSON de salida")
    args = ap.parse_args(argv)

    if not args.i_am_authorized:
        print("ABORTADO: falta --i-am-authorized. Corre esto solo contra redes autorizadas por escrito.",
              file=sys.stderr)
        return 2
    try:
        targets = parse_targets(args.target)
    except ValueError as e:
        print(f"objetivo invalido: {e}", file=sys.stderr)
        return 2
    if not args.allow_public and any(not is_private(t) for t in targets):
        print("ABORTADO: el rango contiene IPs publicas. Usa --allow-public solo si es explicitamente autorizado.",
              file=sys.stderr)
        return 2

    findings = run_scan(targets, parse_ports_arg(args.ports), load_creds(args.creds),
                        try_creds=not args.no_creds, do_validate=not args.no_validate, workers=args.workers)
    report = build_report(findings, args.target)
    print(render_text(report))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
        print(f"\nJSON escrito en {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
