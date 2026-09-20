# health — señales de salud por video (sin contacto)

Módulo **separado del SGR** y de los demás dominios. Visión clásica + DSP: OpenCV + numpy puro,
sin Ultralytics, sin torch, **sin AGPL**.

## ⚠️ Aviso importante — no es de grado médico

Esto es una **señal de tendencia / alerta**, NO un diagnóstico ni un dispositivo clínico. No lo
uses como único medio para decisiones de salud. Requiere cámara fija, buena luz y sujeto
relativamente quieto; con movimiento del cuerpo, oclusión o baja luz la señal se degrada.

| Módulo | Qué hace |
|---|---|
| `breathing_rate.py` | frecuencia respiratoria sin contacto por ROI del tórax |

## breathing_rate.py — frecuencia respiratoria sin contacto

Origen: el concepto del video "Patient Vitals Monitoring" (que resultó ser un clip **generado por
IA**, sin código real). Es una implementación limpia de la técnica conocida: el tórax se mueve de
forma periódica al respirar; se toma una **ROI del pecho**, se mide una señal escalar por cuadro
(por defecto el brillo medio, que fluctúa con el movimiento), se le quita la tendencia y se busca
el **pico de frecuencia** en la banda respiratoria (≈6–40 rpm) por FFT → respiraciones por minuto.

```
ROI del tórax -> señal por cuadro -> remuestreo uniforme -> detrend lineal -> Hann + FFT
              -> pico en la banda 6–40 rpm -> BPM + confianza
```

### Uso

```python
from breathing_rate import BreathingMonitor

mon = BreathingMonitor(roi=(cx, cy, w, h), no_breath_seconds=10.0)   # ROI del tórax, cámara fija
for frame, ts in stream():
    r = mon.update(frame, ts)          # ts en segundos
    if r.ok:
        print(r.hud_line())            # "resp: 16.0 rpm (conf 0.62)"
    if mon.apnea_alarm(ts):
        alertar("sin movimiento respiratorio")   # posible apnea/ausencia -> revisar
```

Solo la señal (si ya la tienes de otra fuente, p.ej. desplazamiento del tórax):

```python
from breathing_rate import BreathingEstimator
est = BreathingEstimator()
for value, ts in signal_stream():
    est.update_signal(value, ts)
r = est.estimate()   # BreathingResult(bpm, confidence, amplitude, reason, ok)
```

### Resultado

`BreathingResult(bpm, confidence, amplitude, reason, ok)`:

- `bpm`: respiraciones por minuto (o `None`).
- `confidence`: fracción de la energía de la banda concentrada en el pico (0..1); baja = señal
  ruidosa o ambigua.
- `amplitude`: desviación de la señal sin tendencia (cuánto se mueve).
- `reason`: `ok` | `insuficiente` (poca duración) | `sin_movimiento` (posible apnea/ausencia) |
  `sin_banda`.

### Ajuste y límites honestos

- **ROI**: céntrala en el pecho/abdomen; una ROI mal puesta o con fondo mata la señal.
- `window_seconds` / `min_seconds`: ventanas más largas dan un BPM más estable pero responden más
  lento; 15 s es un punto de partida.
- `min_amplitude`: umbral para declarar "sin movimiento"; calíbralo a tu cámara y distancia.
- Usa la **confianza** para descartar lecturas: un BPM con `confidence` baja no es fiable.
- No es rPPG (ritmo cardíaco): eso es otra técnica (color de la piel) y otra banda de frecuencia.
- **De nuevo: no es grado médico.** Sirve como alerta ("posible apnea / sin respiración
  detectada") y tendencia, con revisión humana.

### Pruebas

```
python test_breathing_rate.py     # 12 pruebas
```

Recupera BPM conocido (12/20/30) de una sinusoide; alta confianza con señal limpia y menor con
ruido; datos insuficientes; señal plana → `sin_movimiento`; la ventana descarta muestras viejas;
BPM desde una ROI que oscila en un fotograma sintético; `roi=None` usa todo el cuadro; alarma de
apnea tras inmovilidad y ausencia de alarma respirando; `reset()`; dibujo. Todas sintéticas, sin
cámara ni sujeto.
