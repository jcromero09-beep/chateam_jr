"""
sentinel_route.py — ruta y mapa de calor de una persona ENTRE VARIAS CÁMARAS (handoff).

Idea: una persona aparece en la cámara CENTINELA → se abre un "caso" y, a medida que sale del
campo de una cámara y entra en una vecina, se ARMA su ruta a través del sitio (cámara → cámara),
acumulando su rastro y un mapa de calor por cámara.

⚠️ ALCANCE HONESTO — esto es tracking multi-cámara, no identidad:
  - La asociación entre cámaras se hace por TOPOLOGÍA + TIEMPO (grafo de cámaras con ventanas de
    transición esperadas). Eso produce rutas CANDIDATAS con su confianza, NO una afirmación de
    "es la misma persona".
  - El emparejador por apariencia (ReID) es INYECTABLE y OPCIONAL: `matcher(feat_a, feat_b)->score`.
    Sin él, la ruta se arma solo por topología+tiempo (confianza "topology", puede ser ambigua).
    Con él, sube la confianza. Ni con ReID se afirma identidad biométrica: es apoyo a un humano.
  - No identifica a la persona (no pone nombre). Datos personales: base legal, retención, acceso.

No trae detector ni tracker: recibe observaciones YA rastreadas por cámara `(track_id, box)` de tu
detector+tracker externo (RF-DETR/D-FINE Apache + ByteTrack/IoUTracker). Reusa `density_heatmap`.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from density_heatmap import DensityHeatmap, box_point
from pet_events import point_in_polygon


@dataclass
class Edge:
    """Arista de transición entre cámaras, con gating opcional por zonas.

    - `window`: (t_min, t_max) segundos esperados de tránsito.
    - `exit_zone`: polígono en la cámara de ORIGEN; la persona debe SALIR por ahí (su último punto
      cae dentro) para considerar el salto. None = sin gate de salida.
    - `entry_zone`: polígono en la cámara DESTINO; el candidato debe ENTRAR por ahí (su primer punto
      cae dentro). None = sin gate de entrada.
    """
    window: tuple
    exit_zone: list | None = None
    entry_zone: list | None = None


def _as_edge(val) -> Edge:
    """Acepta (t_min, t_max) (compatibilidad) o un Edge ya construido."""
    return val if isinstance(val, Edge) else Edge(window=tuple(val))


@dataclass
class Camera:
    """Nodo de cámara. `edges`: {vecina: (t_min,t_max) | Edge} transición esperada."""
    name: str
    height: int
    width: int
    sentinel: bool = False
    edges: dict = field(default_factory=dict)     # {nombre_vecina: (t_min,t_max) | Edge}


@dataclass
class Segment:
    camera: str
    track_id: int
    t_enter: float
    t_exit: float | None = None
    points: list = field(default_factory=list)    # [(x, y), ...] rastro en esa cámara
    exit_point: tuple | None = None               # último punto conocido (para el gate de salida)


@dataclass
class Hop:
    from_camera: str
    to_camera: str
    dt: float
    confidence: float
    method: str                                   # "topology" | "reid" | "reid+topology"


@dataclass(eq=False)          # identidad (hashable) para poder juntarlas en un set
class Route:
    route_id: int
    segments: list = field(default_factory=list)  # [Segment, ...] en orden temporal
    hops: list = field(default_factory=list)      # [Hop, ...]
    state: str = "active"                         # "active" | "handoff" | "closed"

    @property
    def cameras(self) -> list:
        return [s.camera for s in self.segments]

    def to_dict(self) -> dict:
        return {
            "route_id": self.route_id, "state": self.state, "cameras": self.cameras,
            "segments": [{"camera": s.camera, "track_id": s.track_id,
                          "t_enter": round(s.t_enter, 3),
                          "t_exit": None if s.t_exit is None else round(s.t_exit, 3),
                          "points": len(s.points)} for s in self.segments],
            "hops": [{"from": h.from_camera, "to": h.to_camera, "dt": round(h.dt, 3),
                      "confidence": round(h.confidence, 3), "method": h.method} for h in self.hops],
        }


class SentinelRouteBuilder:
    """Arma rutas multi-cámara a partir de un disparo en la(s) cámara(s) centinela.

    Flujo por cuadro: `update(camera, observations, ts)` con `observations = [(track_id, box), ...]`.
    - En una cámara centinela, cada track nuevo abre una `Route` (persona de interés).
    - Cuando el track activo de una ruta deja de verse `gap_s`, la ruta pasa a `handoff`.
    - Al aparecer un track NUEVO en una cámara vecina dentro de la ventana de transición del grafo
      (y, si hay `matcher`, con score suficiente), se enlaza como el siguiente tramo de la ruta.
    - Opcionalmente el salto se GATEA por zonas: la persona debe salir por la `exit_zone` de la
      cámara origen y el candidato entrar por la `entry_zone` de la destino (ver `Edge`).
    """

    def __init__(self, cameras, *, matcher=None, match_thresh: float = 0.5,
                 gap_s: float = 1.5, heatmap_radius: int = 25, heatmap_decay: float = 1.0,
                 features=None):
        self.cams = {c.name: c for c in cameras}
        self.matcher = matcher                    # (feat_a, feat_b) -> score en [0,1]
        self.match_thresh = match_thresh
        self.gap_s = gap_s
        self.features = features or {}            # {(camera, track_id): feature} opcional para ReID
        self._routes: list = []
        self._next_id = 0
        self._assigned = set()                    # (camera, track_id) ya en alguna ruta
        self._first_seen = {}                     # (camera, track_id) -> ts
        self._last_seen = {}                      # (camera, track_id) -> ts
        self._first_point = {}                    # (camera, track_id) -> (x,y) primer punto (entrada)
        self._clock = 0.0
        self._heat = {c.name: DensityHeatmap(c.height, c.width, radius=heatmap_radius,
                                             decay=heatmap_decay) for c in cameras}

    # ---- API ----
    def update(self, camera: str, observations, ts: float) -> list:
        """Procesa un cuadro de `camera`. Devuelve las rutas modificadas en este cuadro."""
        if camera not in self.cams:
            raise KeyError(f"cámara desconocida: {camera}")
        self._clock = max(self._clock, ts)
        touched = set()

        # bookkeeping de tracks vistos
        seen_ids = []
        for tid, box in observations:
            key = (camera, tid)
            seen_ids.append(tid)
            if key not in self._first_seen:
                self._first_seen[key] = ts
                self._first_point[key] = box_point(box, "bottom")   # punto de entrada
            self._last_seen[key] = ts

        # 1) cerrar tramos "vencidos" (no vistos hace > gap_s) -> pasa a handoff
        self._close_stale()

        # 2) alimentar tramos activos + heatmap con los puntos de esta cámara
        for r in self._routes:
            if r.state != "active" or not r.segments:
                continue
            seg = r.segments[-1]
            if seg.camera == camera and seg.track_id in seen_ids:
                box = next(b for t, b in observations if t == seg.track_id)
                pt = box_point(box, "bottom")
                seg.points.append(pt)
                self._heat[camera].update([pt])
                touched.add(r)

        # 3) centinela: cada track nuevo (no asignado) abre una ruta
        cam = self.cams[camera]
        if cam.sentinel:
            for tid in seen_ids:
                key = (camera, tid)
                if key not in self._assigned:
                    r = self._open_route(camera, tid, ts)
                    touched.add(r)

        # 4) handoff: enlazar rutas pendientes que esperan una vecina == camera
        for r in list(self._routes):
            if r.state != "handoff":
                continue
            if self._try_handoff(r, camera, observations, ts):
                touched.add(r)

        return list(touched)

    def routes(self) -> list:
        return list(self._routes)

    def heatmap(self, camera: str) -> DensityHeatmap:
        return self._heat[camera]

    def heatmaps(self) -> dict:
        return dict(self._heat)

    # ---- interno ----
    def _open_route(self, camera, tid, ts) -> Route:
        r = Route(self._next_id)
        self._next_id += 1
        r.segments.append(Segment(camera, tid, ts))
        self._assigned.add((camera, tid))
        self._routes.append(r)
        return r

    def _close_stale(self) -> None:
        for r in self._routes:
            if r.state != "active" or not r.segments:
                continue
            seg = r.segments[-1]
            last = self._last_seen.get((seg.camera, seg.track_id), seg.t_enter)
            if (self._clock - last) > self.gap_s:
                seg.t_exit = last
                seg.exit_point = seg.points[-1] if seg.points else \
                    self._first_point.get((seg.camera, seg.track_id))
                r.state = "handoff"

    def _try_handoff(self, route: Route, camera: str, observations, ts: float) -> bool:
        prev = route.segments[-1]
        raw = self.cams[prev.camera].edges.get(camera)
        if raw is None:                           # no hay arista prev_camera -> camera
            return False
        edge = _as_edge(raw)
        t_min, t_max = edge.window
        t_exit = prev.t_exit if prev.t_exit is not None else prev.t_enter

        # gate de SALIDA: la persona debió salir por la zona de salida de la cámara origen
        if edge.exit_zone is not None:
            if prev.exit_point is None or not point_in_polygon(prev.exit_point, edge.exit_zone):
                return False

        best = None
        for tid, box in observations:
            key = (camera, tid)
            if key in self._assigned:
                continue
            first = self._first_seen.get(key, ts)
            dt = first - t_exit
            if not (t_min <= dt <= t_max):        # fuera de la ventana de transición
                continue
            # gate de ENTRADA: el candidato debió entrar por la zona de entrada de la cámara destino
            if edge.entry_zone is not None:
                entry_pt = self._first_point.get(key, box_point(box, "bottom"))
                if not point_in_polygon(entry_pt, edge.entry_zone):
                    continue
            method, conf = "topology", self._topology_conf(dt, t_min, t_max)
            if self.matcher is not None:
                fa = self.features.get((prev.camera, prev.track_id))
                fb = self.features.get(key)
                score = float(self.matcher(fa, fb)) if fa is not None and fb is not None else 0.0
                if score < self.match_thresh:
                    continue
                method, conf = ("reid+topology", 0.5 * conf + 0.5 * score)
            cand = (conf, dt, tid, box, method)
            if best is None or cand[0] > best[0]:
                best = cand
        if best is None:
            return False
        conf, dt, tid, box, method = best
        route.segments.append(Segment(camera, tid, self._first_seen.get((camera, tid), ts)))
        route.hops.append(Hop(prev.camera, camera, dt, conf, method))
        route.state = "active"
        self._assigned.add((camera, tid))
        return True

    @staticmethod
    def _topology_conf(dt: float, t_min: float, t_max: float) -> float:
        """Confianza por lo centrado que caiga `dt` en la ventana (1 en el centro, baja a los bordes)."""
        mid = 0.5 * (t_min + t_max)
        half = max(1e-6, 0.5 * (t_max - t_min))
        return max(0.0, 1.0 - abs(dt - mid) / half) * 0.6 + 0.2   # en [0.2, 0.8]
