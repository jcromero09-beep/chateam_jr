# video — módulos del pipeline de visión del SGR

Módulos de seguridad/perímetro, todos **sin AGPL** (OpenCV/numpy; la detección la pone un
detector externo RF-DETR/D-FINE Apache-2.0). El diseño y los injertos están en
`../ARQUITECTURA_VIDEO_FRIGATE_VS_YOLO_MEDIAMTX.md` y `../ARQUITECTURA_VIDEO_ANEXO_MASCOTAS.md`.

| Módulo | Qué hace |
|---|---|
| `motion_gate.py` | motion gating + planificación de regiones (mirar solo donde cambió) |
| `pet_events.py` | `Box`/`Detection`/`Track`, zonas (`ZoneEngine`), eventos, enrutado de alerta |
| `speed_bev.py` | vista cenital (homografía) → velocidad y detención |
| `plate_capture.py` | placas formato ecuatoriano, línea de captura, servicio de placa |
| `plate_watchlist.py` | watchlist (exacta/difusa) y mapeo de rutas (GeoJSON) |
| `vehicle_lock.py` | deduplicado espacial de vehículos (IoU + deriva) |
| `aforo.py` | **conteo de personas por zona y control de aforo** |
| `overlay_sink.py` | anotado → ffmpeg → MediaMTX |

## aforo.py — control de aforo / conteo de personas

Cuenta cuántas personas hay en cada zona y alarma por sobreaforo. **No trae detector**: recibe
cajas de personas de tu detector externo (RF-DETR/D-FINE, Apache-2.0), como
`agriculture/ripeness_hsv.classify_boxes`. Reusa `Box.anchor` (punto de pies) y
`point_in_polygon` de `pet_events.py`.

Decisiones:

- **Pertenencia por el punto de pies**, no por el centro: una persona pertenece a donde pisa
  (como Frigate). Una caja alta cuyo centro cae dentro pero que pisa fuera, no cuenta.
- **Zonas solapadas** cuentan cada una.
- **Suavizado temporal** (mediana en ventana) para que el número no parpadee por huecos del
  detector, y **alarma con persistencia** (N cuadros seguidos en sobreaforo).
- **Niveles** por zona: `ok` / `lleno` (≥ `warn_fraction` del aforo) / `sobreaforo`.
- **Densidad** (personas/m²) si la zona trae `area_m2`.
- **Estimación por área** para multitudes muy densas donde el detector por caja se satura:
  `estimate_count_by_area(fg_mask, avg_person_area_px, zone_polygon)` ≈ área de primer plano /
  área de una persona promedio. Es una **estimación**, no un conteo exacto.

### Uso

```python
from aforo import Zone, AforoMonitor, AforoConfig, draw_aforo

zonas = [
    Zone("entrada", [(0, 0), (640, 0), (640, 480), (0, 480)], capacity=25, area_m2=40.0),
]
mon = AforoMonitor(zonas, AforoConfig(warn_fraction=0.8, window=5, persist_frames=3))

for frame in frames():
    boxes = detector.person_boxes(frame)     # (x1,y1,x2,y2) de tu RF-DETR (Apache)
    report = mon.update(boxes)
    if report.any_alarm:
        alertar(report.alarms)               # zonas en sobreaforo
    salida = draw_aforo(frame, zonas, report)
    print(report.hud_line())  # "total=31 entrada: 27/25 [sobreaforo] ALARMA:entrada"
```

### Ajuste en campo

- `capacity` por zona: el aforo legal/operativo del sitio.
- `warn_fraction`: cuándo avisar "lleno" antes del tope (0.8 = al 80%).
- `window` / `persist_frames`: estabilidad vs. rapidez de reacción. A 10 fps, `window=5` suaviza
  ~0.5 s; `persist_frames=3` exige ~0.3 s en sobreaforo para disparar.
- `avg_person_area_px`: se mide una vez sobre tu cámara, solo si usas la estimación por área.
- El conteo por caja es tan bueno como tu detector; en multitud muy densa combina con la
  estimación por área o baja el ángulo/acércate para que las personas no se ocluyan.

### Pruebas

```
python test_aforo.py     # 15 pruebas
```

Conteo por punto de pies (centro dentro / pie fuera no cuenta), zonas solapadas, entradas por
tupla, niveles, suavizado por mediana, alarma por persistencia y su despeje, total global,
densidad, estimación por área (con y sin zona) y dibujo. Todas sintéticas, sin cámara.
