# Manual de Usuario — UGC Pipeline con Agentes IA

**ChatEAM JR v1.1.0** | Ultima actualizacion: 2026-03-01 | Version Pipeline: 1.0

---

## Tabla de Contenidos

1. [Introduccion](#1-introduccion)
2. [Acceso y Permisos por Plan](#2-acceso-y-permisos-por-plan)
3. [Dashboard UGC](#3-dashboard-ugc)
4. [Identidades IA — Generador de Agentes Virtuales](#4-identidades-ia)
5. [Campanas UGC](#5-campanas-ugc)
6. [Video Studio](#6-video-studio)
7. [Bandeja de Comentarios (Inbox)](#7-bandeja-de-comentarios)
8. [Device Farm — Granja de Dispositivos Android](#8-device-farm)
9. [Cuentas Sociales](#9-cuentas-sociales)
10. [Publicaciones](#10-publicaciones)
11. [Analytics UGC](#11-analytics-ugc)
12. [Red de Creadores](#12-red-de-creadores)
13. [Optimizacion Autonoma](#13-optimizacion-autonoma)
14. [Configuracion](#14-configuracion)
15. [Sistema de Creditos](#15-sistema-de-creditos)
16. [Preguntas Frecuentes](#16-preguntas-frecuentes)
17. [Glosario](#17-glosario)

---

## 1. Introduccion

El **UGC Pipeline** es un sistema integral de generacion masiva de contenido generado por usuarios (User Generated Content) potenciado por Inteligencia Artificial. Permite:

- **Generar identidades IA realistas** con personalidad completa, foto de perfil y contenido semilla
- **Crear videos UGC** con avatares IA y composicion automatizada
- **Publicar en redes sociales** (Instagram, TikTok, Facebook, YouTube) de forma programada o automatica
- **Responder comentarios automaticamente** manteniendo coherencia total de personalidad
- **Optimizar campanas de forma autonoma** con un ciclo de feedback cada 4-6 horas
- **Gestionar una red de creadores** con asignaciones y pagos integrados

### Arquitectura del Pipeline

```
Brief de Campana
    |
    v
[1] Generar Identidades IA -----> Personalidad + Foto DALL-E + Contenido Semilla
    |
    v
[2] Producir Videos UGC --------> Script IA + Avatar + Video + Composicion
    |
    v
[3] Publicar en Redes ----------> Instagram / TikTok / Facebook / YouTube
    |
    v
[4] Monitorear & Responder -----> Clasificar comentarios + Auto-responder EN PERSONAJE
    |
    v
[5] Optimizar -----------------> Feedback loop cada 4h: analizar, decidir, mejorar
    |
    v
    [Loop continuo]
```

### Navegacion

Accede al Pipeline desde el menu lateral: **UGC Pipeline** (icono de video). Contiene 12 secciones organizadas por funcionalidad.

---

## 2. Acceso y Permisos por Plan

### Disponibilidad por Plan de Suscripcion

| Funcionalidad | Demo | Starter | Pro | Enterprise |
|---------------|:----:|:-------:|:---:|:----------:|
| Dashboard UGC | - | Si | Si | Si |
| Identidades IA | - | Si (3 max) | Si (15 max) | Si (100 max) |
| Campanas UGC | - | Si | Si | Si |
| Video Studio | - | Si (5/mes) | Si (50/mes) | Si (500/mes) |
| Bandeja Comentarios | - | - | Si | Si |
| Device Farm | - | - | Si (5 devices) | Si (50 devices) |
| Cuentas Sociales | - | Si (1) | Si (3) | Si (999) |
| Publicaciones | - | Si | Si | Si |
| Analytics UGC | - | - | Si | Si |
| Publicacion Automatica | - | - | Si | Si |
| A/B Testing | - | - | Si | Si |
| Red de Creadores | - | - | - | Si |
| Optimizacion Autonoma | - | - | - | Si |
| Pagos a Creadores | - | - | - | Si |

### Permisos por Rol de Usuario

| Seccion | Super Admin | Admin | Supervisor | Usuario |
|---------|:-----------:|:-----:|:----------:|:-------:|
| Dashboard | Completo | Completo | Completo | Solo lectura |
| Campanas | Completo | Completo | Solo lectura | Sin acceso |
| Videos | Completo | Completo | Solo lectura | Sin acceso |
| Identidades | Completo | Completo | Solo lectura | Sin acceso |
| Generador de Identidades | Completo | Completo | Sin acceso | Sin acceso |
| Device Farm | Completo | Completo | Sin acceso | Sin acceso |
| Bandeja Comentarios | Completo | Completo | Completo | Solo lectura |
| Optimizacion | Completo | Completo | Solo lectura | Sin acceso |
| Configuracion | Completo | Completo | Sin acceso | Sin acceso |

> **Nota:** Los usuarios con plan Demo no veran la seccion "UGC Pipeline" en el menu.

---

## 3. Dashboard UGC

**Ruta:** `/ugc` | **Plan minimo:** Starter

El Dashboard es la vista principal del Pipeline UGC. Proporciona un resumen ejecutivo de toda la operacion.

### Tarjetas de Estadisticas

Se muestran 4 indicadores clave en la parte superior:

| Indicador | Descripcion |
|-----------|-------------|
| **Total Identidades** | Cantidad de agentes IA creados en tu pool |
| **Campanas Activas** | Campanas UGC actualmente en ejecucion |
| **Videos Generados** | Total de videos producidos por el pipeline |
| **Total Interacciones** | Comentarios, replies, likes ejecutados por agentes |

### Secciones del Dashboard

1. **Identidades Recientes** — Muestra las 5 ultimas identidades creadas con:
   - Foto de perfil (avatar circular)
   - Nombre y handle (@usuario)
   - Plataforma principal (Instagram, TikTok, etc.)
   - Nicho de contenido
   - Indicador online/offline
   - Interacciones realizadas hoy

2. **Campanas Recientes** — Muestra las 5 ultimas campanas con:
   - Nombre de la campana
   - Cantidad de videos y agentes asignados
   - Estado actual (borrador, activa, pausada, completada)

### Acciones Disponibles

- **Boton "Ver Todas"** → Navega a la lista completa de identidades o campanas
- **Boton Refresh** → Recarga todos los datos del dashboard

---

## 4. Identidades IA

**Ruta:** `/ugc/identities` | **Plan minimo:** Starter

El Generador de Identidades IA crea **agentes virtuales completos** con personalidad unica, foto de perfil realista generada por DALL-E 3, y contenido semilla para simular una cuenta con historial.

### Vista General — Pool de Identidades

La pantalla se divide en dos paneles:

#### Panel Izquierdo (Sidebar) — Lista del Pool
Lista scrollable de todas las identidades creadas. Cada entrada muestra:
- **Avatar** circular (foto generada por DALL-E)
- **Nombre** del agente (ej: "Sofia Martinez")
- **Handle** sugerido (ej: "@sofia.mtz.fit")
- **Plataforma** principal (Instagram, TikTok, YouTube, Twitter, Multi)
- **Indicador de estado** (circulo verde = activa, gris = inactiva)
- **Contador** de interacciones del dia

#### Panel Derecho — Perfil Completo
Al seleccionar una identidad del sidebar, se despliega su perfil completo:

**Informacion basica:**
- Foto de perfil grande
- Nombre completo
- Handle sugerido
- Ciudad, edad, ocupacion
- Bio optimizada por plataforma

**Tarjetas de estadisticas:**
- Seguidores estimados
- Engagement rate (%)
- Interacciones realizadas hoy

**Seccion Personalidad:**
- **Intereses** — Chips con los 6 intereses principales (ej: "Yoga", "Skincare coreano", "Cocina saludable")
- **Frases tipicas** (catchphrases) — Las 3 frases que caracterizan al agente (ej: "y les juro que...", "literal me cambio la vida")

**Seccion Actividad:**
- Barra de nivel de actividad (0-100%)
- Metricas: interacciones totales, interacciones hoy, engagement rate, seguidores

### Crear Nueva Identidad

1. Haz clic en **"Generar con IA"** (boton superior derecho)
2. Se abre el modal de generacion con 4 campos:

| Campo | Opciones | Descripcion |
|-------|----------|-------------|
| **Nicho** | Lifestyle, Fitness, Tech, Beauty, Food, Travel, Gaming, Business, Fashion, Education | Tema principal del agente |
| **Genero** | Femenino, Masculino, No binario | Genero de la identidad |
| **Rango de Edad** | 18-24, 25-34, 35-44, 45+ | Rango etario |
| **Plataforma** | Instagram, TikTok, YouTube, Twitter, Multi | Red social principal |

3. Haz clic en **"Generar Identidad"**
4. Observa el progreso en 6 pasos animados:

```
Paso 1: "Analizando nicho de contenido..."      (10%)
Paso 2: "Generando personalidad unica..."        (30%)
Paso 3: "Creando historia de vida..."            (50%)
Paso 4: "Diseñando perfil visual..."             (70%)
Paso 5: "Configurando comportamientos..."        (85%)
Paso 6: "Finalizando identidad..."              (100%)
```

5. Al completarse, la nueva identidad aparece automaticamente en el pool del sidebar

### Que genera el sistema internamente

Cuando creas una identidad, el pipeline ejecuta:

1. **Claude genera personalidad** — Nombre, edad, ciudad, ocupacion, bio, 5 rasgos de personalidad, estilo de comunicacion, 3 ejemplos de escritura, 6 intereses, 3 catchphrases, marcas favoritas, pilares de contenido, horarios activos, estilo de respuesta (a halagos, preguntas, interes de compra, criticas), descripcion fisica, backstory de 3-4 oraciones
2. **Claude genera prompt fotografico** — Traduce la descripcion fisica a un prompt optimizado para DALL-E
3. **DALL-E 3 genera foto de perfil** — Foto hiperrealista (1024x1024, calidad HD, estilo natural)
4. **Procesamiento de imagen** — Se crea version circular de 400px para avatar
5. **Variantes fotograficas** — Story vertical (1024x1792) y foto de actividad
6. **Contenido semilla** — Claude genera 10 posts historicos ficticios (simulando 60 dias de actividad) que se guardan como memoria del agente

### Generacion en Lote (Pool)

Para crear multiples identidades simultaneamente:
1. Usa el endpoint `POST /api/ugc/identities/generate-pool`
2. Especifica la cantidad, nicho, y parametros
3. El sistema genera en batches de 3 para optimizar recursos

### Sistema de Memoria

Cada identidad mantiene **memoria persistente** que garantiza coherencia total:
- **Posts previos** — Lo que ha publicado
- **Opiniones** — Posiciones sobre temas (ej: "ama el skincare coreano")
- **Datos personales** — Hechos revelados en conversaciones
- **Interacciones** — Historial de con quien ha interactuado
- **Preferencias** — Gustos y disgustos expresados

> **Ejemplo de coherencia:** Si "Sofia" dice hoy que ama el skincare coreano, NO puede negarlo manana. El sistema de memoria lo previene automaticamente.

### Costos por Identidad

| Componente | Costo Aproximado |
|------------|-----------------|
| Personalidad (Claude) | ~$0.02 |
| Foto de perfil (DALL-E 3) | ~$0.08 |
| Variantes fotograficas | ~$0.08 |
| Contenido semilla (Claude) | ~$0.02 |
| **Total por identidad** | **~$0.80** |

---

## 5. Campanas UGC

**Ruta:** `/ugc/campaigns` | **Plan minimo:** Starter

Las campanas son el contenedor principal que orquesta todo el pipeline: desde la generacion de scripts hasta la publicacion y optimizacion.

### Vista de Campanas

La pantalla muestra:

**Barra de estadisticas:**
- Campanas Activas
- Videos Producidos
- Posts Publicados
- Engagement Total

**Lista de Campanas** — Cada tarjeta muestra:
- Nombre y producto/servicio
- Extracto del brief
- Mini estadisticas (videos, posts, vistas, engagement)
- Presupuesto asignado
- Estado con chip de color
- Fecha de creacion

### Estados de una Campana

| Estado | Color | Descripcion |
|--------|-------|-------------|
| **Borrador** | Gris | Campana creada pero no lanzada |
| **Briefing** | Azul | Definiendo parametros |
| **Produciendo** | Amarillo | Generando videos y contenido |
| **Activa** | Verde | Publicando y monitoreando |
| **Pausada** | Naranja | Temporalmente detenida |
| **Completada** | Morado | Campana finalizada |

### Crear Nueva Campana

Haz clic en **"Nueva Campana"** y completa el wizard de 3 pasos:

#### Paso 1: Brief
| Campo | Descripcion | Ejemplo |
|-------|-------------|---------|
| Nombre | Nombre identificador | "Lanzamiento Crema Solar SPF50" |
| Descripcion | Descripcion detallada | "Campana para el nuevo protector solar..." |
| Producto | Producto/servicio a promocionar | "Crema Solar SPF50 NaturaSkin" |
| Tono | Tono de comunicacion | "Casual y energetico" |
| Audiencia | Publico objetivo | "Mujeres 25-35, interes en skincare" |
| CTA | Llamada a la accion | "Link en bio para 20% de descuento" |

#### Paso 2: Configuracion de Video
| Campo | Opciones | Recomendacion |
|-------|----------|---------------|
| Proveedor | HeyGen, Kling AI, Runway ML | HeyGen para avatares, Kling para calidad |
| Formato | 9:16 (vertical), 16:9 (horizontal), 1:1 (cuadrado) | 9:16 para Reels/TikTok |
| Duracion | 15s, 30s, 60s | 30s para engagement optimo |
| Cantidad | 1-50 videos | Segun plan |
| Idioma | Español, Ingles, Portugues | Segun mercado |

#### Paso 3: Publicacion
| Campo | Opciones | Notas |
|-------|----------|-------|
| Plataformas | Instagram, TikTok, Facebook, YouTube | Multi-select |
| Auto-publicar | Si/No | Requiere plan Pro+ |
| A/B Testing | Si/No | Requiere plan Pro+ |
| Presupuesto | Monto en USD | Para tracking de ROAS |

### Acciones sobre Campanas

- **Lanzar** — Inicia la produccion de videos y publicacion (borrador/pausada → activa)
- **Pausar** — Detiene temporalmente la campana activa
- **Ver Detalle** — Abre vista completa con videos, posts, metricas y pipeline

### Detalle de Campana

Al hacer clic en una campana, se despliega:
- 4 tarjetas de metricas (videos, posts, vistas, engagement)
- Lista de videos con estado del pipeline (6 etapas visualizadas como puntos)
- Score creativo de cada video con barra de progreso coloreada

---

## 6. Video Studio

**Ruta:** `/ugc/videos` | **Plan minimo:** Starter

El Video Studio es la galeria central donde se visualizan, previsualizan y gestionan todos los videos generados por el pipeline.

### Vista de Galeria

**Estadisticas rapidas:**
- Total de videos
- Completados
- En produccion
- Fallidos

**Tarjetas de Video** — Grid responsivo (1 a 5 columnas) con:
- Miniatura del video con indicador de formato (9:16, 16:9, 1:1)
- Nombre del video y campana asociada
- Proveedor usado (chip: HeyGen, Kling, Runway)
- **Puntos del pipeline** — 6 circulos que representan cada etapa:
  - Script → Avatar → Video → Composicion → Review → Listo
  - Cada punto se colorea segun completado/en-progreso/pendiente
- Estado general (En cola, Produciendo, Completado, Fallido)
- Duracion estimada
- **Score Creativo** — Barra de progreso con color:
  - Verde (>70%): Excelente calidad creativa
  - Amarillo (40-70%): Calidad aceptable
  - Rojo (<40%): Requiere revision

### Filtros Disponibles

| Filtro | Opciones |
|--------|----------|
| Busqueda | Por nombre de video |
| Estado | En cola, Produciendo, Completado, Fallido |
| Proveedor | HeyGen, Kling AI, Runway ML |
| Campana | Selector de campanas activas |

### Preview de Video

Al hacer clic en un video completado, se abre el modal de preview:

**Panel Izquierdo:**
- Reproductor de video con controles completos

**Panel Derecho:**
- Informacion de la campana
- Proveedor y formato utilizado
- Duracion real
- Score creativo con detalle
- Script generado (texto completo)
- Timestamps del pipeline (cuando inicio/termino cada etapa)
- Assets disponibles:
  - Raw (video sin editar)
  - Composed (video final)
  - Thumbnail (miniatura)
  - Subtitles (archivo de subtitulos)

### Acciones

- **Preview** — Reproduce video en modal (solo videos completados)
- **Descargar** — Descarga el asset final del video
- **Reintentar** — Re-encola un video fallido para regeneracion

### Pipeline de Generacion de Video

Cada video pasa por 5 etapas automaticas:

```
1. SCRIPT        → Claude/GPT-4o genera el guion desde el brief
2. AVATAR        → HeyGen genera avatar parlante con el script
3. VIDEO         → Kling/Runway genera escenas de video
4. COMPOSICION   → Creatomate/FFmpeg une avatar + video + subtitulos + watermark
5. REVIEW        → Sistema evalua score creativo automaticamente
```

### Costos por Video

| Componente | Costo Aproximado |
|------------|-----------------|
| Script (GPT-4o) | ~$0.02 |
| Avatar (HeyGen) | $1.00 - $3.00 |
| Video (Kling/Runway) | $0.50 - $2.00 |
| Composicion | ~$0.10 |
| **Total por video** | **$1.62 - $5.12** |

---

## 7. Bandeja de Comentarios

**Ruta:** `/ugc/inbox` | **Plan minimo:** Pro

La Bandeja de Comentarios es el centro de gestion de interacciones sociales. Clasifica automaticamente cada comentario y genera respuestas EN PERSONAJE usando la identidad IA asignada.

### Vista General

**Header:**
- Indicador "Auto-respondiendo" (chip verde cuando esta activo)
- Boton de refresh

**Estadisticas:**
| Indicador | Descripcion |
|-----------|-------------|
| Comentarios Hoy | Total de comentarios recibidos en el dia |
| Purchase Intents | Comentarios con intencion de compra detectada |
| Auto-respondidos | Comentarios respondidos automaticamente |
| Pendientes | Comentarios que esperan respuesta |

### Clasificacion Automatica de Comentarios

El sistema usa Claude Haiku para clasificar cada comentario en 5 tipos:

| Tipo | Color | Icono | Ejemplo |
|------|-------|-------|---------|
| **Purchase Intent** | Verde | $ | "Donde lo puedo comprar?" |
| **Pregunta** | Azul | ? | "De que material esta hecho?" |
| **Elogio** | Amarillo | Pulgar arriba | "Me encanta! Se ve increible" |
| **Queja** | Rojo | Alerta | "Pedi hace 2 semanas y no llega" |
| **Neutral** | Gris | Linea | "Interesante" |

### Filtros

- **Por tipo** — Tabs: Todos, Purchase Intent, Preguntas, Elogios, Quejas, Neutral
- **Por plataforma** — Instagram, TikTok, Facebook, YouTube
- **Por estado** — Pendiente, Generado (respuesta lista), Enviado

### Detalle de Cada Comentario

Cada tarjeta de comentario muestra:
1. **Avatar y username** del autor del comentario
2. **Chip de tipo** con color correspondiente
3. **Chip de plataforma** (Instagram azul, TikTok negro, Facebook azul, YouTube rojo)
4. **Tiempo** relativo ("ahora", "hace 5 min", "hace 2h")
5. **Texto** del comentario
6. **Respuesta auto-generada** (si existe) — Burbuja con icono de IA
7. **Agente asignado** — Avatar y nombre de la identidad que responde
8. **Estado** de la respuesta — "Enviado" (verde) o "Generado" (amarillo)

### Acciones por Comentario

| Accion | Disponibilidad | Descripcion |
|--------|---------------|-------------|
| **Generar Respuesta** | Comentarios pendientes | Genera respuesta EN PERSONAJE con la identidad asignada |
| **Clasificar** | Comentarios neutrales | Re-clasifica el comentario con IA |

### Flujo de Auto-Respuesta

```
1. Comentario detectado en post social
2. Claude Haiku clasifica el tipo (purchase_intent, question, praise, complaint)
3. Sistema selecciona el mejor agente segun nicho y personalidad
4. Se carga la memoria del agente (opiniones, datos personales, historial)
5. Claude genera respuesta EN PERSONAJE (con catchphrases, estilo unico)
6. Validador de coherencia verifica que no contradiga memoria previa
7. Haiku extrae datos nuevos de la respuesta para la memoria
8. Respuesta se envia al dispositivo Android → se ejecuta la interaccion
9. Se registra en historial y se actualizan contadores anti-ban
```

### Deteccion de Intencion de Compra

Cuando se detecta un comentario con **Purchase Intent**, el sistema puede:
- Generar respuesta del agente orientada a la venta
- Trigger automatico a WhatsApp/DM para seguimiento comercial
- Registrar en metricas de conversion

---

## 8. Device Farm

**Ruta:** `/ugc/devices` | **Plan minimo:** Pro

El Device Farm permite conectar y gestionar dispositivos Android fisicos que ejecutan las interacciones sociales de los agentes IA.

### Por que Dispositivos Fisicos?

Las plataformas sociales detectan y bloquean interacciones via API/bots. Usar telefonos reales con cuentas reales y patrones humanos de uso reduce drasticamente el riesgo de bans.

### Vista de Dispositivos

**Header:**
- Contador de dispositivos online (chip verde)
- Boton "Registrar Dispositivo"
- Boton Refresh

**Grid de Dispositivos** — Cards responsivas (1 a 4 columnas):

Cada tarjeta muestra:
- **Barra de estado lateral** coloreada (verde=online, gris=offline, amarillo=cooldown, rojo=banned)
- **Nombre y modelo** del dispositivo
- **Chip de estado** — Online, Offline, Cooldown, Banned
- **Info tecnica** — Version Android, IP actual
- **Barra de acciones diarias** — Progreso visual del uso:
  - Verde (<70% del limite): Seguro
  - Amarillo (70-90%): Precaucion
  - Rojo (>=90%): Cerca del limite, riesgo de ban
- **Ultimo heartbeat** — Tiempo desde la ultima señal de vida
- **Identidad asignada** — Foto y nombre del agente que opera desde este dispositivo

### Registrar un Dispositivo

1. Haz clic en **"Registrar Dispositivo"**
2. Completa el formulario:

| Campo | Obligatorio | Descripcion |
|-------|:-----------:|-------------|
| Device ID | Si | Identificador unico del dispositivo Android |
| Nombre | Si | Nombre descriptivo (ej: "Samsung-Oficina-01") |
| Modelo | Si | Seleccionar modelo Android |
| Version Android | Si | 12, 13, o 14 |
| IP | Si | Direccion IP del dispositivo |
| Proxy | No | Configuracion de proxy (host, puerto, credenciales) |

**Modelos soportados:**
- Samsung Galaxy A14 / A54
- Xiaomi Redmi Note 12 / Poco X5
- Motorola G54 / Edge 40
- OnePlus Nord N20
- Realme 11 Pro

3. Haz clic en "Registrar"
4. El dispositivo aparece en el grid con estado "Offline" hasta recibir el primer heartbeat

### Asignar Identidad a Dispositivo

1. En la tarjeta del dispositivo, haz clic en **"Asignar"**
2. Selecciona una identidad disponible del listado
3. El dispositivo comenzara a operar como esa identidad

> **Importante:** Un dispositivo solo puede tener una identidad asignada a la vez. Al cambiar de identidad, se limpia el contexto anterior.

### Sistema Anti-Ban

El Device Farm incluye protecciones automaticas:

| Proteccion | Descripcion |
|------------|-------------|
| **Limite diario** | Maximo de acciones por dia (configurable, recomendado 80-120) |
| **Cooldown automatico** | Pausa de 15 minutos cada 20 acciones |
| **Rotacion de IP/Proxy** | Cambia proxies periodicamente |
| **Horarios activos** | Solo interactua en horarios configurados del agente |
| **Variacion de timing** | Tiempos aleatorios entre acciones para simular humano |
| **Limites por plataforma** | Instagram: 30 comments/h, TikTok: 50 actions/h |

### Estados del Dispositivo

| Estado | Significado | Accion Requerida |
|--------|-------------|-----------------|
| **Online** | Dispositivo conectado y operando | Ninguna |
| **Offline** | Sin conexion o app detenida | Verificar conexion del dispositivo |
| **Cooldown** | Pausa de seguridad anti-ban | Esperar que termine automaticamente |
| **Banned** | Cuenta restringida por la plataforma | Cambiar identidad, revisar configuracion |

---

## 9. Cuentas Sociales

**Ruta:** `/ugc/social-accounts` | **Plan minimo:** Pro

Conecta y gestiona las cuentas de redes sociales donde se publican los contenidos UGC.

### Vista de Cuentas

Grid de tarjetas por cuenta conectada, cada una muestra:
- **Plataforma** — Header con color identificativo
- **Avatar** de la cuenta
- **Nombre y username** de la cuenta
- **3 metricas clave:**
  - Seguidores (formateado: 1.2K, 45.6K, etc.)
  - Cantidad de posts
  - Tasa de engagement (%)
- **Ultima sincronizacion** — Timestamp de la ultima actualizacion de metricas
- **Estado** — Activa (verde), Expirada (amarillo), Revocada (rojo)

### Conectar una Cuenta

1. Haz clic en **"Conectar Cuenta"**
2. Completa el formulario:

| Campo | Descripcion |
|-------|-------------|
| Plataforma | Instagram, TikTok, Facebook, YouTube |
| Nombre de usuario | Username en la plataforma |
| ID de cuenta | ID de la plataforma (se obtiene de la configuracion de la app) |
| Token de acceso | Token OAuth de la cuenta |

3. Haz clic en "Conectar"
4. La cuenta aparece con estado "Activa"

> **Seguridad:** Los tokens se almacenan encriptados con AES-256-CBC. Nunca se exponen en texto plano.

### Sincronizar Metricas

Haz clic en el boton **"Sync"** de cada cuenta para actualizar:
- Conteo de seguidores actualizado
- Metricas de engagement recientes
- Estado del token (si expiro)

### Desconectar Cuenta

Haz clic en **"Desconectar"** para revocar el acceso. Los datos historicos se mantienen pero la cuenta ya no publicara contenido.

### Limites por Plan

| Plan | Cuentas Sociales |
|------|:----------------:|
| Demo | 0 |
| Starter | 1 |
| Pro | 3 |
| Enterprise | 999 (ilimitado) |

---

## 10. Publicaciones

**Ruta:** `/ugc/posts` | **Plan minimo:** Pro

Monitorea todas las publicaciones realizadas en redes sociales con metricas detalladas por post.

### Tabla de Publicaciones

Tabla con scroll horizontal que muestra 12 columnas:

| Columna | Descripcion |
|---------|-------------|
| Miniatura | Preview del contenido (50x50px) |
| Caption | Texto de la publicacion |
| Plataforma | Chip con icono (Instagram/TikTok/Facebook/YouTube) |
| Tipo | Feed, Story, Reel, Short, Video |
| Publicado | Fecha relativa ("hoy", "ayer", "hace 3 dias") |
| Vistas | Numero de reproducciones/impresiones |
| Likes | Cantidad de me gusta |
| Comentarios | Cantidad de comentarios |
| Shares | Veces compartido |
| Engagement % | Tasa de engagement con color: >5% verde, 2-5% amarillo, <2% rojo |
| Purchase Intents | Comentarios con intencion de compra detectada |
| Estado | Published (verde), Scheduled (azul), Failed (rojo) |

### Filtros

- **Plataforma** — Instagram, TikTok, Facebook, YouTube
- **Tipo de post** — Feed, Story, Reel, Short, Video
- **Estado** — Published, Scheduled, Failed

### Leyenda de Engagement

La tabla incluye una leyenda en la parte inferior:
- **>5%** = Engagement excelente (verde)
- **2-5%** = Engagement bueno (amarillo)
- **<2%** = Engagement bajo (rojo)

---

## 11. Analytics UGC

**Ruta:** `/ugc/analytics` | **Plan minimo:** Pro

Dashboard analitico completo que consolida metricas de rendimiento de agentes, plataformas e interacciones.

### Tarjetas de Resumen

| Metrica | Descripcion | Incluye |
|---------|-------------|---------|
| **Total Interacciones** | Suma de todas las acciones | Tendencia % (flecha arriba/abajo) |
| **Purchase Intents** | Intenciones de compra detectadas | Tendencia % |
| **Engagement Promedio** | Tasa de engagement global | Tendencia % |
| **Auto-respondidos** | Comentarios respondidos por IA | Tendencia % |

### Rendimiento por Agente

Tabla con metricas individuales de cada identidad IA:

| Columna | Descripcion |
|---------|-------------|
| Avatar + Nombre | Identidad del agente |
| Interacciones | Total de acciones realizadas |
| Purchase Intents | Intenciones de compra generadas |
| Engagement % | Tasa de engagement del agente |
| Coherencia % | Score de consistencia de personalidad |

### Metricas por Plataforma

Grid 2x2 con tarjetas por plataforma (Instagram, TikTok, Facebook, YouTube):
- Interacciones totales
- Purchase Intents detectados
- Engagement promedio (%)
- Cantidad de posts

### Actividad Reciente

Timeline con las ultimas 20 interacciones:
- Punto de color segun tipo de comentario
- Chip de tipo (Purchase Intent, Pregunta, Elogio, Queja, Neutral)
- Texto del comentario
- Avatar y nombre del agente que respondio
- Icono de plataforma
- Tiempo relativo

### Selector de Rango

Elige el periodo de analisis:
- **7 dias** — Vista semanal
- **30 dias** — Vista mensual
- **90 dias** — Vista trimestral

---

## 12. Red de Creadores

**Ruta:** `/ugc/creators` | **Plan minimo:** Enterprise

Gestiona una red de creadores de contenido humanos con sistema de asignaciones y pagos integrado.

### Vista de Creadores

**Estadisticas:**
- Creadores Activos
- Campanas Asignadas
- Pagos este Mes
- Rating Promedio (estrellas)

**Tarjetas de Creador:**
- Avatar con badge de estado
- Nombre, email, nicho
- Plataformas activas (chips con color por red social)
- 4 metricas: Seguidores, Engagement %, Campanas Completadas, Rating (1-5 estrellas)
- Tarifa base por video
- Botones de accion

### Agregar Creador

1. Haz clic en **"Agregar Creador"**
2. Completa el formulario:

| Campo | Descripcion |
|-------|-------------|
| Nombre | Nombre completo del creador |
| Email | Correo electronico |
| Telefono | Numero de contacto |
| Nicho | Especialidad del creador |
| Plataformas | Redes donde publica (multi-select) |
| Tarifa base | Costo por video |
| Metodo de pago | Stripe, PayPal, Transferencia bancaria |
| Email PayPal | Si selecciona PayPal |

### Asignar a Campana

1. Haz clic en **"Asignar"** en la tarjeta del creador
2. Selecciona la campana
3. Escribe el brief/instrucciones
4. Define la fecha limite
5. Establece la tarifa acordada
6. Haz clic en "Asignar"

### Procesar Pago

1. Haz clic en **"Pagar"** en la tarjeta del creador
2. Ingresa el monto
3. El sistema calcula automaticamente:
   - **Fee de plataforma**: 10% del monto
   - **Monto neto**: Lo que recibe el creador
4. Agrega descripcion y selecciona asignacion relacionada (opcional)
5. Confirma el pago

### Estados del Creador

| Estado | Descripcion |
|--------|-------------|
| Pendiente | Registrado, pendiente de verificacion |
| Verificado | Datos validados, listo para asignar |
| Activo | Con campanas activas en curso |
| Suspendido | Temporalmente inhabilitado |

---

## 13. Optimizacion Autonoma

**Ruta:** `/ugc/optimization` | **Plan minimo:** Enterprise

Sistema de feedback loop que analiza, decide y optimiza campanas cada 4-6 horas de forma totalmente autonoma.

### Vista General

**Header:**
- Titulo "Optimizacion Autonoma"
- Chip de estado: Activo (verde) / Inactivo (gris)

**Estadisticas:**
| Metrica | Descripcion |
|---------|-------------|
| Ciclos Ejecutados | Total de loops de optimizacion completados |
| Learnings Generados | Insights extraidos automaticamente |
| Budget Optimizado | Total optimizado en dolares |
| Mejora Engagement | Incremento promedio de engagement (%) |

### Campanas en Optimizacion

Lista de campanas activas con:
- Nombre de la campana
- Ultimo ciclo ejecutado (timestamp)
- Proximo ciclo programado
- Total de ciclos completados
- **4 acciones:**

| Accion | Descripcion |
|--------|-------------|
| **Ejecutar Ahora** | Fuerza un ciclo de optimizacion inmediato |
| **Optimizar Budget** | Analiza ROAS y redistribuye presupuesto |
| **Extraer Learnings** | Ejecuta extraccion de insights |
| **Ver Metricas** | Despliega tabla de metricas inline |

### Tabla de Metricas (Expandible)

Al hacer clic en "Ver Metricas", se despliega una tabla con snapshots historicos:

| Columna | Descripcion |
|---------|-------------|
| Fecha | Timestamp del snapshot |
| Vistas | Reproducciones |
| Likes | Me gusta |
| Comentarios | Cantidad |
| Engagement % | Tasa con flecha de tendencia |
| Purchase Intents | Con flecha de tendencia |
| ROAS | Return on Ad Spend con flecha |

Las flechas (↑/↓) comparan con el snapshot anterior para visualizar tendencia.

### Learnings (Insights del Sistema)

Tarjetas en grid de 3 columnas con los insights extraidos por la IA:

**Tipos de Learning:**
| Tipo | Emoji | Ejemplo |
|------|-------|---------|
| Estilo de Contenido | CS | "Videos de 30s tienen 2x mas engagement que los de 60s" |
| Horario Optimo | HO | "Publicar a las 7-9 PM genera 45% mas interacciones" |
| Audiencia | AU | "Mujeres 25-34 representan 68% del engagement" |
| Hashtags/Keywords | HP | "#skincare genera 3x mas alcance que #beauty" |
| CTA Efectivo | CT | "CTAs con urgencia ('solo hoy') convierten 2.5x mejor" |
| Formato | FM | "Reels verticales 9:16 superan posts en feed 4:1" |
| Hook/Apertura | HT | "Abrir con pregunta retiene 40% mas que afirmaciones" |
| Tono/Lenguaje | TN | "Tono casual informal genera 60% mas comentarios" |

**Cada tarjeta muestra:**
- Tipo con emoji y chip
- Nivel de impacto: Alto (rojo), Medio (amarillo), Bajo (verde)
- Estado de aplicacion: Aplicado (verde), Pendiente (gris)
- Titulo y descripcion del insight
- Barra de confianza (0-100%)
- Recomendacion especifica (texto destacado)
- Fuente (Feedback Loop, Manual, AI Analysis)
- Campana asociada
- Fecha de aplicacion (si fue aplicado)

### Filtros de Learnings

- **Tipo** — Los 8 tipos listados arriba
- **Impacto** — Alto, Medio, Bajo
- **Campana** — Filtrar por campana especifica

### Ciclo de Feedback Loop

Cada 4 horas (configurable), el sistema ejecuta automaticamente:

```
1. SNAPSHOT  → Captura metricas actuales de cada campana activa
2. DELTA     → Calcula diferencia vs snapshot anterior
3. ANALISIS  → GPT-4o analiza tendencias y detecta patrones
4. LEARNING  → Extrae insights accionables con confianza y evidencia
5. DECISION  → Si confidence > 80% y impacto alto → auto-aplica
6. REPORTE   → Registra todo en UGCCampaignMetrics y UGCCreativeLearnings
```

---

## 14. Configuracion

**Ruta:** `/ugc/settings` | **Plan minimo:** Starter

Configura proveedores de video, integraciones y limites del sistema.

### Proveedores de Video

Grid de 4 tarjetas para configurar API Keys:

| Proveedor | Descripcion | Uso |
|-----------|-------------|-----|
| **HeyGen** | Avatares IA parlantes | Videos con presentador virtual |
| **Kling AI** | Generacion de video IA | Videos de alta calidad |
| **Runway ML** | Generacion de video IA | Estilo cinematografico |
| **Creatomate** | Composicion de video | Templates y edicion automatizada |

Para cada proveedor:
1. Ingresa tu **API Key** (campo protegido con show/hide)
2. Haz clic en **"Test Connection"** para verificar
3. Si funciona, haz clic en **"Save"**
4. El chip cambia a "Configurado" (verde)

> Las API Keys se muestran enmascaradas: `abcd•••••••xyz`

### Cloudinary (Almacenamiento de Imagenes)

Configuracion para subir fotos de perfil de identidades:
- **Cloud Name** — Nombre de tu cuenta Cloudinary
- **API Key** — Clave de API
- **API Secret** — Secreto de API (protegido)

### Optimizacion Autonoma

| Configuracion | Descripcion | Opciones |
|---------------|-------------|----------|
| Feedback Loop | Activar/desactivar el loop autonomo | On/Off |
| Intervalo | Frecuencia del ciclo | 2h, 4h, 6h, 12h, 24h |
| Auto-aplicar | Aplicar automaticamente recomendaciones de alto impacto | On/Off (precaucion) |

> **Advertencia:** "Auto-aplicar recomendaciones de alto impacto" modifica campanas automaticamente basandose en los learnings del sistema. Activar con precaucion.

### Limites Anti-Ban

| Parametro | Recomendado | Descripcion |
|-----------|:-----------:|-------------|
| Acciones diarias/dispositivo | 80-120 | Maximo de acciones por dia en cuentas nuevas |
| Cooldown cada X acciones | 15 min | Pausa obligatoria para simular comportamiento humano |
| Comments/hora Instagram | Max 30 | Limite de comentarios por hora en Instagram |
| Acciones/hora TikTok | Max 50 | Limite de acciones por hora en TikTok |

> **Importante:** Los limites anti-ban son criticos para evitar restricciones en las cuentas. Usa valores conservadores para cuentas nuevas y aumenta gradualmente.

### Almacenamiento

Toda la configuracion se guarda localmente y se sincroniza con el backend al guardar.

---

## 15. Sistema de Creditos

El Pipeline UGC consume creditos segun el tipo de operacion realizada.

### Tipos de Credito UGC

| Tipo | Costo | Descripcion |
|------|:-----:|-------------|
| `ugc_video` | $0.50 | Por cada video generado |
| `social_post` | $0.05 | Por cada publicacion en redes |
| `agent_identity` | $0.80 | Por cada identidad IA creada |
| `agent_interaction` | $0.02 | Por cada interaccion (comment, like, follow) |
| `creator_payment` | $1.00 | Por cada pago procesado a creador |
| `ugc_optimization` | $0.10 | Por cada ciclo de optimizacion |

### Creditos por Plan (por ciclo de facturacion)

| Tipo | Demo | Starter | Pro | Enterprise |
|------|:----:|:-------:|:---:|:----------:|
| ugc_video | 2 | 10 | 50 | 500 |
| social_post | 10 | 50 | 200 | Ilimitado |
| agent_identity | 0 | 3 | 15 | 100 |
| agent_interaction | 0 | 100 | 1,000 | Ilimitado |
| creator_payment | 0 | 50 | 200 | 1,000 |
| ugc_optimization | 5 | 20 | 100 | Ilimitado |

### Deduccion de Creditos

Los creditos se deducen automaticamente al ejecutar cada operacion:
- Generar identidad → 1 credito `agent_identity`
- Generar video → 1 credito `ugc_video`
- Publicar en red social → 1 credito `social_post`
- Responder comentario → 1 credito `agent_interaction`
- Ciclo de optimizacion → 1 credito `ugc_optimization`

Si no hay creditos suficientes, la operacion se rechaza con un mensaje indicando que debes adquirir mas creditos o actualizar tu plan.

### Monitoreo de Creditos

Consulta tu balance de creditos desde el **Dashboard de Creditos IA** en la seccion "Plataforma IA" del menu principal.

---

## 16. Preguntas Frecuentes

### General

**P: Necesito conocimientos tecnicos para usar el Pipeline UGC?**
R: No. La interfaz esta diseñada para ser intuitiva. Solo necesitas definir el brief de tu campana y el sistema se encarga del resto.

**P: Puedo usar el Pipeline UGC sin dispositivos Android?**
R: Si. Las funciones de generacion de identidades, videos y campanas funcionan sin dispositivos. Los dispositivos son necesarios solo para la interaccion automatica en redes (comentar, dar like, seguir).

**P: Cuanto tarda en generarse una identidad IA?**
R: Aproximadamente 30-60 segundos. El proceso incluye generacion de personalidad, foto de perfil y contenido semilla.

**P: Cuanto tarda en generarse un video UGC?**
R: Depende del proveedor: HeyGen 2-5 minutos, Kling 5-15 minutos, Runway 3-10 minutos. La composicion final agrega 1-3 minutos adicionales.

### Identidades

**P: Como mantiene coherencia el agente IA?**
R: Cada vez que un agente responde, el sistema extrae automaticamente datos personales, opiniones y preferencias que se guardan en su memoria persistente. La proxima respuesta consulta toda esa memoria para mantener coherencia.

**P: Puedo editar una identidad despues de crearla?**
R: Si. Puedes actualizar campos basicos como bio, intereses y catchphrases. Los cambios se reflejan en futuras interacciones.

**P: Puedo regenerar la foto de perfil?**
R: Si. Usa la opcion "Regenerar Foto" para generar una nueva foto con DALL-E 3 manteniendo la descripcion fisica de la identidad.

### Device Farm

**P: Que pasa si un dispositivo se desconecta?**
R: El sistema detecta la desconexion via heartbeat. El dispositivo aparece como "Offline" y las interacciones pendientes se pausan. Al reconectarse, se reanuda automaticamente.

**P: Como evito que baneen mis cuentas?**
R: Configura limites conservadores en Configuracion > Anti-Ban: 80-100 acciones/dia para cuentas nuevas, aumentando gradualmente. El sistema maneja cooldowns y variacion de tiempos automaticamente.

**P: Necesito proxies?**
R: Es altamente recomendable para evitar deteccion. Configura proxies diferentes por dispositivo en el formulario de registro.

### Optimizacion

**P: Que tan seguido se ejecuta el feedback loop?**
R: Por defecto cada 4 horas. Configurable en Configuracion > Optimizacion entre 2h y 24h.

**P: El sistema hace cambios sin mi autorizacion?**
R: Solo si activas "Auto-aplicar recomendaciones de alto impacto" en Configuracion. Sin esta opcion, los learnings se generan pero no se aplican automaticamente.

### Creditos y Costos

**P: Que pasa si se me acaban los creditos?**
R: Las operaciones se rechazan con un mensaje de error. Puedes adquirir packs de creditos adicionales o actualizar tu plan de suscripcion.

**P: Los creditos se renuevan automaticamente?**
R: Si. Se resetean al inicio de cada ciclo de facturacion segun tu plan.

---

## 17. Glosario

| Termino | Definicion |
|---------|-----------|
| **UGC** | User Generated Content — Contenido que parece creado por usuarios reales |
| **Identidad IA** | Agente virtual con personalidad, foto y memoria propias |
| **Device Farm** | Conjunto de dispositivos Android fisicos controlados remotamente |
| **Catchphrase** | Frase tipica que caracteriza a una identidad (ej: "y les juro que...") |
| **Purchase Intent** | Comentario que expresa intencion de compra |
| **Feedback Loop** | Ciclo automatico de analisis y optimizacion |
| **Learning** | Insight o aprendizaje extraido por la IA de los datos |
| **ROAS** | Return On Ad Spend — Retorno por inversion publicitaria |
| **Anti-Ban** | Sistema de protecciones contra restricciones de plataformas sociales |
| **Cooldown** | Pausa obligatoria entre acciones para simular comportamiento humano |
| **Heartbeat** | Señal periodica que envia un dispositivo para confirmar que esta activo |
| **Score Creativo** | Puntuacion de calidad del video generado (0-100%) |
| **Coherencia** | Medida de consistencia entre la personalidad del agente y sus respuestas |
| **Brief** | Documento con los parametros y objetivos de una campana |
| **Pipeline** | Secuencia automatizada de pasos (script → avatar → video → publicacion) |
| **Seed Content** | Contenido semilla — Posts ficticios historicos para simular actividad previa |
| **Token OAuth** | Credencial de acceso a una cuenta de red social |
| **AES-256** | Algoritmo de encriptacion usado para proteger tokens sensibles |
| **BullMQ** | Sistema de colas que procesa jobs de forma asincrona |
| **DALL-E 3** | Modelo de OpenAI para generacion de imagenes fotorrealistas |
| **Claude Haiku** | Modelo rapido de Anthropic para clasificacion y extraccion de datos |
| **HeyGen** | Plataforma de generacion de avatares IA parlantes |
| **Kling AI** | Plataforma de generacion de video IA de alta calidad |
| **Runway ML** | Plataforma de generacion de video IA estilo cinematografico |
| **Creatomate** | Plataforma de composicion automatizada de video |
| **Cloudinary** | Servicio de almacenamiento y procesamiento de imagenes en la nube |

---

## Soporte

Para dudas o problemas con el Pipeline UGC:
- **Email:** soporte@chateam.ws
- **WhatsApp:** Contacta al equipo de soporte desde el chat de la plataforma

---

*Documento generado automaticamente — ChatEAM JR v1.1.0 — UGC Pipeline v1.0*
