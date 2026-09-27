# Herramientas de campo del instalador

Utilidades de una sola pasada para el **alta** de una instalación. NO forman parte del producto en
marcha ni corren en producción. Se usan a mano, sobre redes que el cliente autorice por escrito.

## cam_discovery.py — descubrimiento inicial de cámaras

Enumera endpoints de cámara (RTSP/ONVIF/HTTP) en la subred del cliente, infiere fabricante, valida
qué streams entregan vídeo con `ffprobe`, y marca las cámaras que siguen con **credenciales de
fábrica** como hallazgo de seguridad. Python + stdlib, sin Nmap ni Masscan.

```bash
# uso típico (LAN privada del cliente)
python cam_discovery.py 192.168.1.0/24 --i-am-authorized --out alta_cliente.json

# rango explícito, con lista propia de credenciales y sin probar credenciales
python cam_discovery.py 10.0.0.10-10.0.0.60 --i-am-authorized --creds mis_creds.txt
python cam_discovery.py 192.168.1.0/24 --i-am-authorized --no-creds
```

Salvaguardas incorporadas:

- Exige `--i-am-authorized`; sin ese flag aborta con código 2.
- Solo rangos privados (RFC1918) salvo `--allow-public` explícito.
- Lista de credenciales de fábrica corta (≤12) y corte al primer acierto por host: detecta
  descuido, no hace fuerza bruta. Ampliable por archivo bajo tu responsabilidad.
- Timeouts y concurrencia acotados; nunca escribe en las cámaras, solo lee.
- Enmascara las contraseñas en la salida (`admin:*****`).

Salida JSON (`schema: cam_discovery/1`): resumen, `securityFindings` (credenciales débiles con la
acción recomendada) y una entrada por cámara con puertos, fabricante, URL validada y codec.

Requiere `ffprobe` (paquete `ffmpeg`) para validar streams; sin él enumera puertos pero no confirma
vídeo.

Pruebas: `python test_cam_discovery.py` (16 tests de la lógica pura, sin red).

## Encadenado con el pipeline

Las URLs RTSP validadas que produce este descubrimiento son la entrada de `go2rtc` en el edge.
Una vez dadas de alta y cambiadas las credenciales de fábrica, el resto del sistema
(`docs/video/`) consume solo el substream desde `go2rtc`, nunca el XVR directo.
