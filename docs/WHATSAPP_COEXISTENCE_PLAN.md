# Plan de Coexistencia WhatsApp Business App + Cloud API en ChatEAM

**Fecha**: 27 de Febrero 2026
**Version**: 1.0
**Estado**: Analisis completo - Pendiente implementacion

---

## Tabla de Contenidos

1. [Contexto y Objetivo](#1-contexto-y-objetivo)
2. [Estado Actual de ChatEAM](#2-estado-actual-de-chateam)
3. [Que es la Coexistencia de WhatsApp (Meta)](#3-que-es-la-coexistencia-de-whatsapp-meta)
4. [Impacto en la Arquitectura de ChatEAM](#4-impacto-en-la-arquitectura-de-chateam)
5. [Roadmap de Implementacion](#5-roadmap-de-implementacion)
6. [Evaluacion de Riesgos](#6-evaluacion-de-riesgos)
7. [Recomendaciones](#7-recomendaciones)
8. [Verificacion y Testing](#8-verificacion-y-testing)
9. [Fuentes](#9-fuentes)

---

## 1. Contexto y Objetivo

ChatEAM es una plataforma CRM omnicanal (Node.js/TypeScript, PostgreSQL, Redis) que actualmente opera en **modo Baileys-only** (libreria no oficial de WhatsApp) pero tiene toda la infraestructura de Cloud API v24.0 **construida y deshabilitada**.

Meta lanzo en febrero 2026 la funcionalidad de **Coexistencia** (GA - General Availability) que permite usar el WhatsApp Business App y el Cloud API en el mismo numero simultaneamente.

**Objetivo**: Analizar como implementar esta coexistencia en ChatEAM, permitiendo una migracion gradual desde Baileys hacia la API oficial de Meta sin perder funcionalidad.

---

## 2. Estado Actual de ChatEAM

### 2.1 Baileys - ACTIVO (Conexion Principal)

| Aspecto | Detalle |
|---------|---------|
| **Archivos** | `services/WbotServices/` (19 archivos de servicio) |
| **Modelo DB** | `Whatsapp.provider = "stable"`, `channel = "whatsapp"` |
| **Estado** | Produccion activa, TODAS las conexiones actuales usan Baileys |
| **Config** | `WHATSAPP_HYBRID_MODE=baileys_only` |
| **Riesgo** | Libreria no oficial, riesgo PERMANENTE de baneos por Meta |

**Servicios principales de Baileys**:
- `services/WbotServices/wbotMessageListener.ts` - Handler de mensajes entrantes
- `services/WbotServices/StartWhatsAppSession.ts` - Bootstrap de sesion (QR code)
- `services/BaileysServices/` - CRUD para persistencia de sesiones

### 2.2 Meta Cloud API - CONSTRUIDO pero DESHABILITADO

| Aspecto | Detalle |
|---------|---------|
| **Version API** | v24.0 (noviembre 2024) |
| **Estado** | Completamente funcional pero APAGADO |
| **Config** | `WHATSAPP_CLOUD_API_ENABLED=false` |

**Archivos clave del Cloud API**:

```
services/WhatsAppCloudAPI/CloudAPIService.ts    -> Servicio Cloud API v24.0 completo
services/MetaServices/metaMessageListener.ts    -> Handler de webhooks (~500 lineas)
services/MetaServices/metaSendService.ts        -> Envio de mensajes (text, template, media, buttons, list, location, contact)
services/MetaServices/metaClient.ts             -> Factory de clientes HTTP dinamicos por phoneNumberId
controllers/MetaWebhookController.ts            -> Verificacion GET + recepcion POST de webhooks
```

**Modelo de datos existente** (`models/Whatsapp.ts`):
```typescript
provider: string;          // "stable" (Baileys) | "meta" (Cloud API)
channel: string;           // "whatsapp" | "meta" | "telegram" | "facebook" | "instagram"
tokenMeta: string;         // Access token de Meta
phoneNumberId: string;     // Phone Number ID de Cloud API
displayPhoneNumber: string;// Numero legible
facebookUserId: string;    // WABA ID
facebookBusinessId: string;// Business ID
facebookPageUserId: string;// Page User ID
facebookAdAccountId: string;// Ad Account ID
```

### 2.3 Servicio Hibrido - CONSTRUIDO pero DORMIDO

La arquitectura hibrida ya existe y fue disenada para exactamente este caso:

```
services/WhatsAppAdapter/HybridWhatsAppService.ts      -> Circuit breaker, modos configurables
services/WhatsAppAdapter/DualAdapter.ts                 -> Adaptador dual con fallback automatico
services/WhatsAppAdapter/IntelligentLoadBalancer.ts     -> Balanceo por volumen/salud/costo/hora
```

**Modos disponibles** (config `WHATSAPP_HYBRID_MODE`):
| Modo | Descripcion |
|------|-------------|
| `baileys_only` | Solo Baileys (ACTUAL) |
| `cloud_only` | Solo Cloud API |
| `baileys_first` | Baileys primario, Cloud API fallback |
| `cloud_first` | Cloud API primario, Baileys fallback |
| `auto` | Balanceo inteligente automatico |

### 2.4 Frontend Actual

- `frontend/src/components/MetaCloudModal/index.tsx` - Entrada MANUAL de token + phoneNumberId (NO tiene Embedded Signup)
- `frontend/src/pages/Connections.tsx` - Gestion de conexiones con modal unificado
- `frontend/src/components/UnifiedConnectionModal/index.tsx` - Soporta tipos: whatsapp, meta, telegram, facebook, instagram

### 2.5 Credenciales Meta Configuradas

```env
FACEBOOK_APP_ID=3943706329209315
FACEBOOK_APP_SECRET=3f8515ef6689405753a70d0c3678b924
FB_GRAPH_VERSION=v24.0
FB_ACCESS_TOKEN=EAA4Cx67... (token activo)
FB_AD_ACCOUNT_ID=665461992181555
```

### 2.6 Webhook Actual

```
GET  /webhook/metaws  -> MetaWebhookController.verifyMetaWebhook (verificacion hub.challenge)
POST /webhook/metaws  -> MetaWebhookController.receiveMetaWebhook (eventos)
POST /webhook/meta    -> WhatsAppController.storeMeta (creacion/actualizacion de conexion)
```

El controller actual solo maneja:
1. `messages` -> `handleMetaWebhookMessage`
2. `message_template_status_update` -> `HandleTemplateStatusWebhookService`

### 2.7 Anti-Ban System (3 Fases)

```env
# Fase 1: Rate Limiting
WHATSAPP_MAX_MESSAGES_PER_HOUR=30
WHATSAPP_MIN_DELAY_MS=2000
WHATSAPP_SIMULATE_TYPING=true
WHATSAPP_ENABLE_RATE_LIMITING=true

# Fase 2: Monitoreo
WHATSAPP_HEALTH_CHECK_INTERVAL=30000
WHATSAPP_REDIS_RATE_LIMIT=true

# Fase 3: Hibrido
WHATSAPP_HYBRID_MODE=baileys_only
WHATSAPP_ENABLE_INTELLIGENT_ROUTING=true
WHATSAPP_ENABLE_CIRCUIT_BREAKER=true
```

---

## 3. Que es la Coexistencia de WhatsApp (Meta)

### 3.1 Definicion

La Coexistencia permite que un negocio use el **WhatsApp Business App** (telefono, manual) y el **WhatsApp Cloud API** (servidor, automatizado) **en el mismo numero simultaneamente**.

```
+---------------------------+          +------------------+          +-------------------------+
| WhatsApp Business App     |  <--->   | Servidores Meta  |  <--->   | Cloud API / ChatEAM     |
| (Conversaciones manuales) |          | (Sincronizacion) |          | (Automatizacion,        |
| Staff lee/responde        |          |                  |          |  templates, campanas,   |
|                           |          |                  |          |  chatbots, CRM)         |
+---------------------------+          +------------------+          +-------------------------+
```

**Ambos lados ven las mismas conversaciones**:
- Mensajes enviados desde la Business App aparecen como webhook events al Cloud API
- Mensajes enviados via Cloud API aparecen en la Business App
- Historico de mensajes (hasta 180 dias, solo texto) se sincroniza durante el onboarding

### 3.2 Flujo de Embedded Signup (Onboarding)

```
1. Usuario clickea "Conectar WhatsApp" en ChatEAM
         |
2. Se renderiza el widget de Meta Embedded Signup (Facebook JS SDK)
         |
3. Se abre dialogo de Facebook Login
         |
4. Usuario logea en su cuenta de Facebook
         |
5. Selecciona (o crea) su WhatsApp Business Account
         |
6. Selecciona el numero de telefono para Coexistencia
         |
7. Meta retorna un CODIGO DE AUTORIZACION a ChatEAM (callback)
         |
8. Backend intercambia codigo por System User Access Token
   POST https://graph.facebook.com/v24.0/oauth/access_token
         |
9. Se almacena token, phoneNumberId, WABA ID en DB
         |
10. Meta inicia sincronizacion de mensajes historicos en background
```

**Integracion tecnica del Embedded Signup**:
- Cargar `facebook-jssdk` en el frontend
- Llamar `FB.login()` con scopes: `whatsapp_business_management`, `whatsapp_business_messaging`
- El parametro `config_id` especifica la configuracion (creada en Meta Business Manager)
- El callback recibe `code`, `wa_id` (WABA ID), y detalles del numero

### 3.3 Nuevos Webhooks de Coexistencia

Estos son **3 nuevos campos de webhook** que ChatEAM DEBE suscribir y procesar:

#### 3.3.1 `history` - Sincronizacion Historica
| Campo | Detalle |
|-------|---------|
| **Cuando** | Minutos despues del onboarding exitoso |
| **Contenido** | Mensajes historicos (hasta 180 dias, SOLO texto, sin media) |
| **Estructura** | Array de mensajes con: `from`, `to`, `id`, `timestamp`, `type`, `text` |
| **Metadata** | `phase`, `chunk_order`, `progress` (para tracking de sincronizacion) |
| **Error** | Codigo 2593109 si el usuario desactivo el historial desde la App |

#### 3.3.2 `smb_app_state_sync` - Sincronizacion de Contactos
| Campo | Detalle |
|-------|---------|
| **Cuando** | Post-onboarding, continuo |
| **Contenido** | Actualizaciones de contactos desde la Business App |
| **Campos** | Tipo de contacto, nombre completo, nombre, telefono, accion (add/modify/delete) |

#### 3.3.3 `smb_message_echoes` - Eco de Mensajes de la App (CRITICO)
| Campo | Detalle |
|-------|---------|
| **Cuando** | Tiempo real, cada vez que staff envia un mensaje desde la Business App |
| **Contenido** | Mensaje completo con: `from` (numero negocio), `to` (numero cliente), `id`, `timestamp`, `type`, contenido |
| **Importancia** | **ES EL WEBHOOK MAS CRITICO** - permite que ChatEAM vea lo que el staff envia manualmente |
| **Limitacion** | Mensajes desde companion devices no soportados (Windows, WearOS) NO generan este webhook |

### 3.4 Requisitos para Coexistencia

| Requisito | Detalle |
|-----------|---------|
| Version App | WhatsApp Business App v2.24.17 o superior |
| Actividad | Numero con 7+ dias de uso activo en la Business App |
| Facebook Page | Vinculada al WhatsApp Business Account |
| Liveness | Abrir la Business App al menos cada 13 dias |
| BSP | Ser BSP registrado o usar un BSP existente |
| Verificacion | Partner-Led o Meta Verified (NO Standard Business Verification) |

### 3.5 Disponibilidad Geografica

**DISPONIBLE en (ChatEAM opera en Ecuador - COMPATIBLE)**:
- LATAM: Ecuador, Mexico, Brasil, Colombia, Argentina, Chile, Peru, etc.
- Norteamerica: USA, Canada
- Asia: India, Indonesia, Hong Kong, Singapur
- Otros mercados soportados

**NO disponible en**:
- EU/EEA (30 paises)
- Reino Unido
- Australia
- Japon
- Rusia
- Sudafrica
- Turquia
- Nigeria
- Filipinas
- Corea del Sur

### 3.6 Funciones DESHABILITADAS en Modo Coexistencia

| Funcion | Estado |
|---------|--------|
| Listas de difusion (Broadcast) | Solo lectura |
| Mensajes que desaparecen | Deshabilitado |
| Mensajes view-once | Deshabilitado |
| Ubicacion en vivo | Deshabilitado |
| Edicion/eliminacion de mensajes | No sincroniza entre App y API |
| Sincronizacion de grupos | No soportado |
| Llamadas voz/video via API | No soportado |
| Actualizaciones de perfil | Solo via Business App |
| WhatsApp para Windows | Companion no soportado |
| WhatsApp para WearOS | Companion no soportado |
| Catalogo y pedidos | No soportado via API |

---

## 4. Impacto en la Arquitectura de ChatEAM

### 4.1 Cambios en el Webhook Controller

**Archivo**: `controllers/MetaWebhookController.ts`

**Estado actual** (lineas 36-52):
```typescript
// Solo maneja 2 tipos:
1. isTemplateStatusWebhook -> HandleTemplateStatusWebhookService
2. default -> handleMetaWebhookMessage
```

**Necesita agregar routing para 3 nuevos campos**:
```typescript
// NUEVO routing necesario:
1. messages                      -> handleMetaWebhookMessage (EXISTE)
2. message_template_status_update -> HandleTemplateStatusWebhookService (EXISTE)
3. history                       -> NUEVO handleHistoryWebhook
4. smb_app_state_sync            -> NUEVO handleSmbAppStateSync
5. smb_message_echoes            -> NUEVO handleSmbMessageEchoes
```

### 4.2 Nuevos Servicios a Crear

| Archivo | Funcion | Complejidad |
|---------|---------|-------------|
| `services/MetaServices/metaHistorySyncService.ts` | Importar mensajes historicos (180 dias), crear contactos/tickets, marcar como leidos, NO activar chatbots | Media |
| `services/MetaServices/metaSmbAppStateSyncService.ts` | Sincronizar actualizaciones de contactos desde la Business App | Baja |
| `services/MetaServices/metaSmbMessageEchoesService.ts` | Procesar mensajes enviados desde la Business App: crear Message con `fromMe:true`, NO activar chatbots/AI | Alta |
| `services/MetaServices/metaEmbeddedSignupService.ts` | Flujo OAuth de Embedded Signup: intercambiar codigo por token, crear/actualizar registro Whatsapp | Alta |

### 4.3 Cambios en el Modelo de Datos

#### Tabla `Whatsapps` - Nuevos campos:
```sql
ALTER TABLE "Whatsapps" ADD COLUMN "coexistenceEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "Whatsapps" ADD COLUMN "coexistenceStatus" VARCHAR(50) DEFAULT NULL;
  -- Valores: 'pending_sync' | 'syncing' | 'active' | 'disabled'
ALTER TABLE "Whatsapps" ADD COLUMN "coexistenceOnboardedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE "Whatsapps" ADD COLUMN "lastAppOpenedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE "Whatsapps" ADD COLUMN "embeddedSignupSessionId" VARCHAR(255) DEFAULT NULL;
```

#### Tabla `Messages` - Nuevo campo:
```sql
ALTER TABLE "Messages" ADD COLUMN "sourceChannel" VARCHAR(50) DEFAULT NULL;
  -- Valores: 'cloud_api' | 'business_app' | 'baileys' | 'history_import'
```

### 4.4 Cambios en el Frontend

#### Reemplazar/Extender MetaCloudModal
**Archivo actual**: `frontend/src/components/MetaCloudModal/index.tsx` (entrada manual de token)

**Nuevo componente**: `frontend/src/components/EmbeddedSignupModal/index.tsx`
- Cargar Facebook JS SDK (`window.FB.init(...)`)
- Renderizar boton "Conectar con Facebook"
- Manejar `FB.login()` con scopes: `whatsapp_business_management`, `whatsapp_business_messaging`
- Enviar codigo de autorizacion al backend
- Mostrar progreso de sincronizacion (pending_sync -> syncing -> active)
- Mostrar salud de conexion (last app opened, warning de 13 dias)

#### Actualizar Connections Page
**Archivo**: `frontend/src/pages/Connections.tsx`
- Agregar tipo de conexion "Meta Coexistencia"
- Mostrar indicadores de estado de coexistencia
- Alerta cuando se acerca el limite de 13 dias sin abrir la App
- Badge visual diferenciando Baileys vs Coexistencia vs Cloud API puro

### 4.5 Suscripcion de Webhooks

**Archivo**: `services/FacebookServices/graphAPI.ts` (funcion `subscribeApp`)

**Actual**: `messages, messaging_postbacks, message_deliveries, message_reads, message_echoes, conversations, message_reactions`

**Agregar**: `history, smb_app_state_sync, smb_message_echoes`

### 4.6 Deduplicacion CRITICA

Cuando se envia un mensaje desde la Business App, puede llegar como:
1. `smb_message_echoes` (eco del mensaje del staff)
2. `messages` (webhook normal)

**Solucion**: Deduplicar por `message.id` / `wid` en TODOS los handlers antes de crear registros en la tabla Messages. Usar `findOne({ where: { wid: messageId } })` antes de `CreateMessageService`.

---

## 5. Roadmap de Implementacion

### Fase 1: Fundacion (Semanas 1-2)

**Objetivo**: Preparar infraestructura sin romper Baileys.

| # | Tarea | Archivos |
|---|-------|----------|
| 1.1 | Crear migracion DB para campos de coexistencia | `database/migrations/YYYYMMDD-add-coexistence-fields.ts` |
| 1.2 | Actualizar modelos Whatsapp y Message | `models/Whatsapp.ts`, `models/Message.ts` |
| 1.3 | Habilitar Cloud API (`WHATSAPP_CLOUD_API_ENABLED=true`) | `.env` |
| 1.4 | Extender webhook router para detectar y loguear nuevos campos | `controllers/MetaWebhookController.ts` |
| 1.5 | Actualizar suscripcion de webhooks | `services/FacebookServices/graphAPI.ts` |

### Fase 2: Handlers de Webhooks (Semanas 2-3)

**Objetivo**: Procesar todos los webhooks de Coexistencia.

| # | Tarea | Archivos |
|---|-------|----------|
| 2.1 | Crear handler de historial | `services/MetaServices/metaHistorySyncService.ts` |
| 2.2 | Crear handler de sincronizacion de contactos | `services/MetaServices/metaSmbAppStateSyncService.ts` |
| 2.3 | Crear handler de ecos de mensajes (CRITICO) | `services/MetaServices/metaSmbMessageEchoesService.ts` |
| 2.4 | Implementar deduplicacion por `wid` | Todos los handlers de mensajes |
| 2.5 | Agregar tracking de `sourceChannel` | `CreateMessageService` y handlers |

### Fase 3: Embedded Signup (Semanas 3-5)

**Objetivo**: Onboarding oficial via OAuth de Meta.

| # | Tarea | Archivos |
|---|-------|----------|
| 3.1 | Crear endpoint backend para Embedded Signup | `controllers/WhatsAppController.ts`, `routes/webHookRoutes.ts` |
| 3.2 | Crear servicio de intercambio OAuth | `services/MetaServices/metaEmbeddedSignupService.ts` |
| 3.3 | Crear componente frontend con Facebook JS SDK | `frontend/src/components/EmbeddedSignupModal/index.tsx` |
| 3.4 | Gestion de tokens de larga duracion | `services/MetaServices/metaEmbeddedSignupService.ts` |
| 3.5 | Configurar Facebook App en Meta Business Manager | Configuracion externa |

### Fase 4: Modo Hibrido (Semanas 5-7)

**Objetivo**: Activar operacion dual Baileys + Coexistencia.

| # | Tarea | Archivos |
|---|-------|----------|
| 4.1 | Activar `HybridWhatsAppService` | `.env`, `services/WhatsAppAdapter/HybridWhatsAppService.ts` |
| 4.2 | Configurar per-connection: Baileys O Coexistencia | `models/Whatsapp.ts`, `frontend/` |
| 4.3 | Monitoreo de salud de Coexistencia | `controllers/WhatsAppMonitorController.ts` |
| 4.4 | Job programado para alerta de 13 dias | `jobs/` o `scheduler/` |
| 4.5 | Dashboard de metricas dual | `routes/whatsappMetaDashboardRoutes.ts` |

### Fase 5: Migracion y Documentacion (Semanas 7-9)

**Objetivo**: Path de migracion para clientes existentes.

| # | Tarea | Archivos |
|---|-------|----------|
| 5.1 | Wizard de migracion Baileys -> Coexistencia | Frontend nuevo componente |
| 5.2 | Verificacion de elegibilidad de numero | Backend endpoint |
| 5.3 | Handover graceful entre conexiones | `services/WhatsAppAdapter/` |
| 5.4 | Documentacion para clientes | `docs/` |

---

## 6. Evaluacion de Riesgos

### 6.1 Matriz de Riesgos

| # | Riesgo | Severidad | Probabilidad | Mitigacion |
|---|--------|-----------|--------------|------------|
| R1 | Restriccion geografica (EU/UK/etc) | **Alta** | Cierta | Mantener Baileys como opcion para regiones restringidas |
| R2 | Baileys + Coexistencia en MISMO numero | **Critica** | N/A | **IMPOSIBLE.** Cada numero debe ser Baileys O Coexistencia |
| R3 | Token de Meta expira sin renovar | **Alta** | Media | Refresh automatico + alertas + monitoreo |
| R4 | Business App no abierta en 13 dias | **Media** | Alta | Job de monitoreo + notificacion push al staff |
| R5 | Cooldown 1-2 meses para numeros con WABA previo | **Media** | Media | Verificar elegibilidad ANTES de iniciar migracion |
| R6 | Sincronizacion inicial falla (hasta 6h) | **Media** | Baja | UI de progreso + reintentos automaticos |
| R7 | Deduplicacion de mensajes echo vs messages | **Media** | Alta | Deduplicar por `message.id`/`wid` en todos los handlers |
| R8 | Funciones deshabilitadas en coexistencia | **Baja** | Cierta | Documentar, adaptar UI para ocultar funciones |
| R9 | Companion devices no soportados | **Baja** | Media | Documentar limitacion de Windows/WearOS |

### 6.2 PUNTO CRITICO: Baileys vs Coexistencia

```
IMPORTANTE: NO son compatibles en el mismo numero.

Meta Coexistencia = Business App + Cloud API en el mismo numero.
Baileys = Cliente WhatsApp no oficial en el mismo numero.

Tener 3 clientes activos (Business App + Baileys + Cloud API)
en UN numero causaria:
  - Conflicto de sesion
  - Deteccion por Meta
  - Baneo del numero

ARQUITECTURA CORRECTA:
  Numero A -> Baileys (no oficial)
  Numero B -> Coexistencia (Business App + Cloud API oficial)

Una instancia de ChatEAM puede manejar AMBOS tipos simultaneamente
gracias al campo `provider` en el modelo Whatsapp.
```

### 6.3 Problemas Comunes en el Onboarding

| Problema | Causa | Solucion |
|----------|-------|----------|
| Numero no elegible | Menos de 7 dias de actividad | Usar Business App activamente 1-2 meses |
| Conflicto WABA previo | Numero vinculado a otro WABA | Eliminar WABA anterior, esperar 1-2 meses |
| QR no aparece | App desactualizada | Actualizar a v2.24.17+ |
| Facebook Page no vincula | Permisos insuficientes | Verificar admin access en Meta Business |
| Nombre bloqueado | Meta bloquea post-onboarding | Verificar nombre ANTES del setup |
| Sync de historico falla | Volumen alto o conexion inestable | Mantener App abierta, internet estable |

---

## 7. Recomendaciones

### 7.1 Estrategia Recomendada: Migracion Gradual con Soporte Dual

```
                    ARQUITECTURA OBJETIVO

+----------------------------------------------------------+
|                    ChatEAM Platform                       |
|                                                          |
|  +------------------+    +---------------------------+   |
|  | Baileys          |    | Meta Coexistencia         |   |
|  | (Conexiones      |    | (Business App + Cloud API)|   |
|  |  existentes,     |    | (Nuevos clientes,         |   |
|  |  regiones sin    |    |  clientes migrados)       |   |
|  |  coexistencia)   |    |                           |   |
|  +--------+---------+    +------------+--------------+   |
|           |                           |                  |
|           +----------+  +------------+                   |
|                      |  |                                |
|              +-------v--v--------+                       |
|              | HybridWhatsApp    |                       |
|              | Service           |                       |
|              | (Router + LB)     |                       |
|              +-------------------+                       |
+----------------------------------------------------------+
```

1. **Ofrecer Coexistencia como opcion premium** para clientes que quieren cumplimiento oficial y estabilidad
2. **Mantener Baileys** para clientes en regiones restringidas o con preferencia de costo
3. **Usar la arquitectura HybridWhatsAppService existente** - fue disenada exactamente para esto
4. **Posicionar Coexistencia como destino de migracion** - nuevos clientes en Coexistencia por defecto

### 7.2 BSP: Estrategia en 2 Etapas

**Etapa 1 (Inmediata)**: Usar BSP existente
- 360dialog, Twilio, o similar
- Lanzamiento rapido, compliance garantizado
- La infraestructura de ChatEAM ya integra con Graph API v24.0

**Etapa 2 (6-12 meses)**: Certificacion BSP propia
- Mejores margenes (sin intermediario)
- Control total sobre la experiencia
- Requiere: proceso de certificacion Meta, compliance, soporte dedicado

### 7.3 Quick Wins Inmediatos (Semana 1)

| # | Accion | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Habilitar `WHATSAPP_CLOUD_API_ENABLED=true` | Desbloquea toda la infra existente | 1 min |
| 2 | Extender webhook router para loguear nuevos campos | Visibilidad inmediata | 2 horas |
| 3 | Crear migracion DB para nuevos campos | Prepara modelo de datos | 1 hora |

### 7.4 Ventajas Clave de Coexistencia para ChatEAM

| Ventaja | Detalle |
|---------|---------|
| **Sin riesgo de baneo** | API oficial de Meta, cumplimiento total |
| **Templates oficiales** | Envio de templates aprobados por Meta (re-engagement) |
| **Escalabilidad** | Sin limite de conexiones WebSocket |
| **Dual operacion** | Staff usa App para chats rapidos, ChatEAM para automatizacion |
| **Historial sincronizado** | Hasta 180 dias de contexto importado |
| **Ads integration** | Click-to-WhatsApp ads con tracking nativo |
| **Metricas oficiales** | Quality rating, phone health, delivery stats de Meta |

---

## 8. Verificacion y Testing

### 8.1 Tests por Fase

| Fase | Test | Metodo |
|------|------|--------|
| 1 | Migracion DB ejecuta sin errores | `npx sequelize-cli db:migrate` |
| 1 | Webhook router loguea nuevos campos | Enviar POST manual a `/webhook/metaws` |
| 2 | History handler importa mensajes | Simular payload `history` con curl |
| 2 | Echo handler crea mensajes `fromMe:true` | Simular payload `smb_message_echoes` |
| 2 | Deduplicacion funciona | Enviar mismo `wid` dos veces, verificar 1 solo registro |
| 3 | Embedded Signup completa flujo | Usar numero de prueba con Facebook Test User |
| 3 | Token se almacena correctamente | Verificar registro Whatsapp en DB |
| 4 | Modo hibrido funciona | Enviar mensaje, verificar routing |
| 4 | Alerta de 13 dias funciona | Simular `lastAppOpenedAt` hace 12 dias |
| 5 | Migracion Baileys -> Coexistencia | Migrar numero de prueba, verificar tickets |

### 8.2 Payloads de Prueba

#### Test: `smb_message_echoes`
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "smb_message_echoes",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "593XXXXXXXXX",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "message_echoes": [{
          "from": "593XXXXXXXXX",
          "to": "593YYYYYYYYY",
          "id": "wamid.UNIQUE_ID",
          "timestamp": "1709049600",
          "type": "text",
          "text": { "body": "Hola, le confirmo su cita para manana" }
        }]
      }
    }]
  }]
}
```

#### Test: `history`
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "history",
      "value": {
        "messaging_product": "whatsapp",
        "history_context": {
          "phase": "initial",
          "chunk_order": 1,
          "progress": 50,
          "status": "approved"
        },
        "threads": {
          "593YYYYYYYYY": [{
            "from": "593YYYYYYYYY",
            "id": "wamid.HIST_001",
            "timestamp": "1706457600",
            "type": "text",
            "text": { "body": "Buenos dias, necesito informacion" }
          }]
        }
      }
    }]
  }]
}
```

---

## 9. Fuentes

- [Meta WhatsApp Coexistence - Business Walkthrough (PickyAssist)](https://pickyassist.com/blog/meta-whatsapp-coexistence-business-walkthrough/)
- [WhatsApp Coexistence - Use Business App & API Together (Wetarseel)](https://wetarseel.ai/whatsapp-coexistence-whatsapp-business-app-api-together/)
- [WhatsApp Coexistence Embedded Signup - Issues & Resolutions (ChakraHQ)](https://chakrahq.com/article/issues-whatsapp-coexistence-onboarding-setup/)
- [Coexistence Webhooks Documentation (360Dialog)](https://docs.360dialog.com/partner/waba-management/whatsapp-coexistence/coexistence-webhooks)
- [WhatsApp Coexistence Now Live in EU & UK (ChakraHQ)](https://chakrahq.com/article/whatsapp-coexistence-live-eu-uk-europe-whatsapp-business-for-api-live/)
- [Meta Developers - Embedded Signup Documentation](https://developers.facebook.com/docs/whatsapp/embedded-signup)
- [WhatsApp Coexistence Partner Documentation (360Dialog)](https://docs.360dialog.com/partner/waba-management/whatsapp-coexistence)
- [Postman - WhatsApp Business Platform Embedded Signup Collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup)

---

## Addendum v1.7 — Ticket Canónico Único y Endurecimiento Anti-Duplicado (2026-06-18)

### Problema resuelto
Una empresa (ej. SmartTrack) con conexión Meta + Baileys hermanas sobre el mismo
número podía generar **tickets/mensajes separados** para la misma conversación.
Funcionalmente es la **misma charla** con el mismo cliente → debe ser **un solo
ticket canónico**.

### Cambios implementados
1. **`CoexistenceTicketRoutingService`** (nuevo) — fuente única de verdad:
   `resolveCoexistencePair`, `resolveTicketOwner`, `shouldDropProviderEvent`,
   `resolveOrCreateCanonicalTicket`, `findEquivalentOutboundMessage`,
   `switchTicketOwner`, `isCoexistenceSibling`.
2. **`smb_message_echoes`** ahora resuelve `conversationId` y reutiliza el ticket
   canónico; deduplica `meta_echo` contra `baileys_fromme` reciente (mismo ticket,
   body normalizado, ventana 120s) → no crea ticket/mensaje doble.
3. **Defaults Meta principal** en coexistencia: `Whatsapps.sendChannel` default
   `meta` (modelo + migración `20260618000001`, ALTER DEFAULT + UPDATE acotado).
   UI y runtime coinciden.
4. **`switchTicketOwner`** + endpoint `POST /coexistence/tickets/:id/switch-owner`:
   el selector de canal cambia el owner real (`whatsappId` + `channel` +
   `routingPolicy` + socket) sin crear otro ticket.
5. **Filtros UI por canal activo** en la bandeja (Todos / WhatsApp / Meta /
   Facebook / Instagram / Telegram). Filtran por `Ticket.channel`, no crean
   conversaciones separadas.
6. **Un solo intento lógico** en envíos automáticos: fallback Meta→Baileys
   contenido en `helpers/SendMessage.ts` (sólo tras fallo de Meta; nunca ambos).

### Endpoints
- `POST /coexistence/tickets/:ticketId/switch-owner` `{ provider: 'meta'|'baileys' }`

### Validación
- `tsc --noEmit` backend: sin errores en archivos tocados.
- `jest tests/unit/coexistence-ticket-routing.test.ts`: 11/11 PASS.

### Compatibilidad
- Tickets legacy sin `conversationId` siguen funcionando (lookup legacy intacto).
- Canales Facebook / Instagram / Telegram sin cambios.

### Fase C — Flujos automáticos al router central (2026-06-18)
- Nuevo guard `services/CoexistenceServices/CoexistenceAwareTextSender.ts`
  (`sendTicketText`): coexistencia → `routeAndSendOutbound`; legacy → `SendWhatsAppMessage`.
- `backendCronJobs.ts` (recordatorios de citas) y
  `services/OmnichannelServices/OmnichannelDispatcher.ts` (followups y otros)
  migrados al guard. El cron omite su persistencia manual si `viaRouter=true`.
- Validación: `jest` 14/14 PASS (facade + sender). `tsc` sin errores en archivos tocados.
