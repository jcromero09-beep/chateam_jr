# audio — detección de eventos de audio (llanto, voz, tono) sin AGPL

Paquete portado del pipeline **"Baby Cry Detection"** de OpenViewer (video walkthrough real:
`efficientnet_b0` sobre mel-espectrograma + ventana deslizante + pre-filtro de energía + gate por
racha). Aquí queda **genérico y de licencia limpia**: numpy/scipy puros, PyAV opcional para leer
la pista de un video, y el **clasificador pesado se inyecta** (tu EfficientNet/otro Apache/BSD).
Así el motor sirve para **llanto, tos, cristal roto, alarma, ladrido, voz/no-voz…**, y todo se
prueba con tonos sintéticos, sin modelos ni GPU.

## ⚠️ Alcance honesto

- Detecta **eventos acústicos** y describe el sonido (energía, tono, espectro, actividad). NO
  identifica personas por su voz (biometría de voz = dato sensible, no se incluye).
- El **clasificador** de la clase concreta (p.ej. "Cry") es tuyo: se inyecta. Sin él, el paquete
  igual mide energía, F0, VAD y espectro (numpy/scipy).
- Audio en el hogar puede ser dato personal: define base legal, retención y acceso.

## Licencias — sin AGPL

numpy/scipy **BSD** · PyAV (`av`) **BSD-3** (decodifica MP4/AAC sin binario externo) · librosa
**ISC** (opcional) · cv2 **Apache-2.0** (opcional, solo para la imagen del espectrograma).
`imageio_ffmpeg` **BSD** empaqueta un binario ffmpeg (LGPL/GPL) — solo relevante si redistribuyes
ese binario. **Cero Ultralytics/YOLO.** El pipeline original usa `efficientnet_b0(weights=None)`
(entrena su checkpoint) → ningún peso de terceros embebido.

## Módulos

| Archivo | Rol |
|---|---|
| `audio_io.py` | cargar audio de WAV o de la **pista de un video** → mono float32 @ 16 kHz (PyAV → librosa → wav stdlib → ffmpeg) |
| `features.py` | **mel-espectrograma**, `spectrogram_image` (entrada de la CNN), RMS(dB), centroide, ZCR, banda de voz, **F0/pitch** (autocorrelación **y YIN**) y estadísticos de **variación de tono** |
| `vad.py` | **detección de actividad** (voz/sonido) por energía + banda → máscara y segmentos |
| `sliding_window.py` | **motor genérico**: ventana deslizante + pre-filtro de energía + gate por racha, con **clasificador inyectado** → eventos |
| `prosody.py` | **mediciones prosódicas** para apoyo forense (F0, jitter/shimmer, pausas, tasa de habla, energía) — **descriptivas, con `disclaimer`; NO detectan mentiras** |

## 🚫 Lo que este paquete NO hace: detección de mentiras por voz

`prosody.py` mide propiedades del habla, pero **no infiere veracidad, engaño ni emoción**, y no
debe usarse para eso. El "análisis de estrés vocal" / detección de mentiras por voz (VSA, LVA)
**carece de respaldo científico**: la evidencia revisada por pares (p. ej. *National Research
Council*, 2003, y estudios de campo posteriores) la sitúa **en el azar**. El tono, las pausas y el
jitter suben con el **estrés, los nervios, el acento, el ruido o un resfriado — no con la mentira**.
Etiquetar estas cifras como "engaño" fabrica un dato y discrimina por acento/nervios (prohibido por
`AGENTS.md §3`). Uso legítimo: transcripción, diarización, control de calidad y **mediciones neutras
para un perito humano**. Cada reporte lleva un campo `disclaimer` que viaja con el dato.

## Uso

```python
import audio_io, features as F, vad, sliding_window as sw

# 1) cargar la pista de audio de un video (PyAV, sin ffmpeg externo)
y, sr = audio_io.load_from_video("caso.mp4", sr=16000)

# 2) describir el sonido (sin modelos)
print(F.f0_stats(F.f0_track(y, sr)[1]))          # {'median':410, 'std':187, ...} -> tono y variación
print(F.spectral_centroid(y, sr))                # brillo
print(vad.active_ratio(y, sr), vad.detect_segments(y, sr))   # actividad y tramos

# 3) detectar eventos con TU clasificador (mel-espectrograma -> prob)
def classify(clip):
    img = F.spectrogram_image(clip, img_size=224)     # numpy uint8 (224,224,3)
    prob = tu_modelo(img)                             # EfficientNet u otro (inyectado)
    return (1, float(prob))                           # (class_id, prob)

cfg = sw.WindowConfig(sr=sr, window_sec=3, hop_sec=1, conf_threshold=0.70, consecutive=3)
results, events = sw.detect(y, classify, cfg)
print(sw.summary(results, events))
```

El motor solo llama a `classify` en ventanas con energía (pre-filtro barato) y solo declara
**evento** tras `consecutive` ventanas positivas seguidas sobre `conf_threshold` (el `Streak` del
HUD) → mata falsos positivos de un pico aislado.

## Otros usos (misma arquitectura, otra etiqueta)

- **VAD / voz vs. no-voz** → `vad.detect_segments` (energía + banda 300-3000 Hz).
- **Variación de tono / entonación** → `F.f0_track(method='autocorr'|'yin')` + `F.f0_stats` (mediana, rango, desviación). YIN es más robusto ante el error de octava.
- **Eventos del hogar/seguridad** → llanto, tos, cristal, alarma, ladrido: reentrena el
  clasificador inyectado, el motor no cambia.
- **Salud** → tos/ronquido/respiración (complementa `docs/safety/breathing_rate.py`, que lo hace
  por video).
- **Apoyo forense** → `prosody.prosody_report(y, sr)` da mediciones neutras (F0, jitter/shimmer,
  pausas, tasa, energía) con su `disclaimer`; combínalas con el hash SHA-256 de la pista de audio
  (cadena de custodia, como el video en `docs/forensic/forensic.py`). **No** emite veredictos.

## Validado sobre audio real

Sobre `ecba08c3-VIDEO-...mp4` (llanto de bebé, 13.4 s), el paquete reproduce el análisis manual:
F0 mediana **410 Hz** (desv. ±187), centroide **2848 Hz**, energía en banda de voz **0.67**,
actividad **44.6 %**, y el motor genérico agrupa el llanto en un evento. La pista se decodifica
con PyAV (AAC 44.1 kHz estéreo → 16 kHz mono).

## Pruebas

```
python test_features.py        # 18  (energía, mel, espectral, F0 autocorr + YIN, imagen)
python test_vad.py             # 6   (actividad, segmentos, banda, merge, mínimos)
python test_sliding_window.py  # 9   (pre-filtro, racha, clase, resumen, eventos)
python test_audio_io.py        # 5   (round-trip WAV, resample, mono, stdlib)
python test_prosody.py         # 10  (jitter/shimmer, pausas, tasa, reporte SIN veredicto)
```

**48 pruebas verdes** con señales sintéticas (tonos/ruido/silencio) — sin audio real, sin
torch/librosa, sin GPU. El clasificador pesado se sustituye por uno falso inyectado.
