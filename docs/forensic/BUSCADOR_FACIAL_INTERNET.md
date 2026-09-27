# Cómo funciona un buscador facial de internet (PimEyes / Clearview / FaceSeek)

> **Documento de ANÁLISIS.** Explica la arquitectura y las tecnologías para entenderla y para
> defenderse de ella. **NO es una guía de implementación.** Construir un motor que identifica a
> desconocidos raspando la web es ilegal/regulado en muchas jurisdicciones y facilita acoso y
> vigilancia masiva (ver §7). En este repositorio SOLO se implementa el cotejo 1:N **consentido**
> contra base propia (`face_match_enrichment.py`), nunca el buscador de internet.

## 1. Qué hace, en una frase

Subes la foto de una cara → te devuelve **otras fotos de esa misma persona** que hay en la web
pública, con los enlaces. No "sabe el nombre": encuentra **apariciones** de la misma cara; el nombre
lo infiere el usuario de las páginas donde aparece.

## 2. El truco no es el modelo, es el ÍNDICE

El reconocimiento facial (detección + embedding) es tecnología **abierta y de sobra conocida**. Lo
que hace único —y problemático— a un buscador facial de internet es haber **raspado y vectorizado
miles de millones de caras** de la web pública (redes sociales, blogs, medios, foros) y guardarlas
en un índice de búsqueda por similitud. Clearview declaró **>30 000 millones** de imágenes; PimEyes
opera con **miles de millones**. Ese índice es el activo (y el delito).

## 3. Arquitectura (dos mitades)

```
  MITAD OFFLINE (construir el índice)                  MITAD ONLINE (consulta)
  ┌───────────────────────────────┐                    ┌───────────────────────────┐
  │ crawler web / compra de datos │                    │ el usuario sube una cara  │
  │            ↓                   │                    │            ↓              │
  │ detección de caras (por foto) │                    │ detección + alineación    │
  │            ↓                   │                    │            ↓              │
  │ alineación 112×112            │                    │ embedding (mismo modelo)  │
  │            ↓                   │                    │            ↓              │
  │ embedding 512-d (ArcFace)     │                    │ búsqueda ANN en el índice │
  │            ↓                   │                    │            ↓              │
  │ upsert al índice vectorial ───┼──── mismo espacio ─┼──→ top-K vecinos          │
  │ (vector + URL + metadatos)    │                    │            ↓              │
  └───────────────────────────────┘                    │ re-ranking + páginas/URLs │
                                                        └───────────────────────────┘
```

Ambas mitades **comparten el mismo modelo de embedding**: solo así el vector de tu foto cae en el
mismo espacio que los mil millones ya indexados y la distancia coseno tiene sentido.

## 4. Tecnologías por etapa (detallado)

### 4.1 Adquisición (la mitad turbia)
- **Crawlers** a gran escala (Scrapy, crawlers propios, cabezas headless con Playwright/Puppeteer
  para sitios con JS), colas de trabajo (Kafka/Celery/SQS), almacenamiento de objetos (S3/GCS).
- APIs y "brokers" de datos; a veces compra de datasets. Aquí es donde se viola ToS y ley de datos.

### 4.2 Detección de caras
- **RetinaFace**, **SCRFD** (InsightFace), **MTCNN**, o **YOLO-face**. Devuelven caja + 5 landmarks
  (ojos, nariz, comisuras). Corren en GPU por lotes sobre millones de imágenes.

### 4.3 Alineación
- Transformación afín/similaridad usando los 5 landmarks → recorte canónico **112×112** con ojos y
  boca en posiciones fijas. Normaliza pose y escala para que el embedding sea comparable.

### 4.4 Embedding (el corazón del "match")
- Una CNN entrenada con **pérdidas de margen angular** que separan identidades:
  **ArcFace** (margen aditivo angular), CosFace, SphereFace; backbones ResNet/IResNet/MobileFaceNet.
- Salida: vector **512-d L2-normalizado**. Misma persona → vectores casi paralelos (coseno ≈ 1);
  personas distintas → casi ortogonales. **El "reconocimiento" es geometría de vectores**, no un
  clasificador con nombres.
- Datasets de entrenamiento (histórico): MS-Celeb-1M, Glint360K, WebFace260M, VGGFace2 — muchos con
  **licencias de investigación/no comerciales** o retirados por privacidad.

### 4.5 Índice y búsqueda 1:N (a escala de miles de millones)
- **Búsqueda por vecinos aproximados (ANN)**: **HNSW** (grafos navegables) o **IVF-PQ**
  (cuantización de producto) para caber en RAM y responder en milisegundos.
- Motores: **FAISS** (Meta), **ScaNN** (Google), o bases vectoriales **Milvus / Qdrant / Vespa /
  Weaviate**. Sharding por millones de particiones; réplicas para throughput.
- Se guarda, junto al vector: **URL de origen, thumbnail, fecha, y a veces texto/dominio** para
  contexto.

### 4.6 Re-ranking y presentación
- Los top-K por coseno se **re-rankean** (calidad de cara, tamaño, consistencia multi-foto) y se
  agrupan por persona/página. Se muestran los enlaces. Algunos añaden OCR/《texto de la página》para
  sugerir nombre — de ahí sale la "identificación".

## 5. Por qué funciona tan bien (y sus límites)
- **Funciona** porque el embedding es robusto a iluminación, pose moderada, edad y gafas, y porque
  el índice es gigantesco (casi todos tenemos fotos públicas).
- **Falla / arriesga**: gemelos y parecidos (falsos positivos), sesgo demográfico (peor precisión
  en pieles oscuras y mujeres — NIST FRVT lo documenta), maquillaje/ángulos extremos, y **daño por
  falso positivo**: señalar a la persona equivocada.

## 6. Contramedidas (defensa, lo útil de entender esto)
- **Fawkes** / **LowKey**: perturbaciones adversarias en tus fotos que envenenan el embedding.
- Ajustes de privacidad en redes, marca de agua, y **solicitudes de exclusión/borrado** (PimEyes y
  otros ofrecen opt-out; GDPR da derecho de supresión).
- Detección de que te están buscando (algunos servicios lo permiten a la propia persona).

## 7. Legalidad y ética (por qué NO se implementa aquí)
- **GDPR (UE)**: la cara es dato biométrico "categoría especial" (art. 9); tratarla para identificar
  necesita base legal explícita/consentimiento. Clearview fue **multada** en Italia, Francia, Grecia
  y UK (~€20M cada una) y se le ordenó **borrar** datos de esos países.
- **BIPA (Illinois, EE. UU.)**: consentimiento informado por escrito antes de capturar biometría;
  Clearview firmó un acuerdo que le prohíbe vender a la mayoría de privados en EE. UU.
- **Daño directo**: deanonimizar a cualquiera en la calle → acoso, stalking, doxxing, control abusivo.
- Por eso, en este repo, **solo** existe el cotejo **1:N consentido contra base propia**
  (`face_match_enrichment.py`): sin red, sin scraping, con `consent_ref` obligatorio y `legal_basis`.

## 8. La versión legítima (lo que sí puedes montar)
Misma tecnología de las §4.2–4.5, pero **contra una galería que TÚ posees y enrolaste con
consentimiento** (empleados/socios/miembros opt-in, o watchlist con base legal):

| Pieza | Opción de licencia limpia |
|---|---|
| Detección + embedding | **CompreFace** (Apache-2.0, servicio self-hosted) · InsightFace (código MIT; **verifica licencia de pesos**) · facenet-pytorch (MIT) |
| Búsqueda 1:N | **FAISS** (MIT) · **Qdrant** / **Milvus** (Apache-2.0) |
| Contrato + custodia + ética | `docs/forensic/face_match_enrichment.py` (este repo) |

Flujo: extractor externo → embedding 512-d → `ConsentedGallery.add(EnrolledFace(..., consent_ref))`
→ `match_probe(embedding, gallery, legal_basis=...)` → coincidencias sobre umbral, como **pista**
para revisión humana. Nunca contra la web, nunca sobre desconocidos.
