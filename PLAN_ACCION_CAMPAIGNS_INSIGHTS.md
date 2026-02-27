# PLAN DE ACCION: Mejora del Modulo Campaigns/Insights
## Roadmap de Implementacion por Fases

**Plataforma:** chateam_jr - CRM Omnicanal
**Fecha:** Febrero 2026
**Duracion total estimada:** 30 semanas (6 fases)
**Documento complementario:** `INFORME_CAMPAIGNS_INSIGHTS_2026.md`

---

## VISION GENERAL

### Objetivo
Transformar el modulo campaigns/insights de una herramienta de **solo lectura** (40-50% de funcionalidad) a una **plataforma completa de gestion, automatizacion y optimizacion de Meta Ads** con diferenciadores unicos en el mercado.

### Propuesta de Valor Unica (UVP)
> La unica plataforma que unifica CRM WhatsApp omnicanal + gestion completa de Meta Ads + IA para segmentacion por niveles de conciencia + ciclo automatizado de diagnostico y reconstruccion de anuncios.

### Mapa de Fases

```
FASE 1 (Sem 1-4)     FASE 2 (Sem 5-8)     FASE 3 (Sem 9-12)
Fundamentos           Segmentacion          Automatizacion
  CRUD campanas        Temperatura            Motor de reglas
  Fix TODOs            Intereses ocultos      A/B Testing
  Alertas              Custom/Lookalike       Budget automation
  Export mejorado      Frontend segment.      Frontend rules
       |                    |                      |
       v                    v                      v
FASE 4 (Sem 13-18)   FASE 5 (Sem 19-24)   FASE 6 (Sem 25-30)
IA Avanzada           Integraciones         Diferenciacion
  Diagnostico IA       CTWA dashboard        Niveles conciencia
  Copy generator       WA Flows              Diagnostico-Rebuild
  Scoring predictivo   Reportes auto         Atribucion WA-first
  Anomalias            Real-time
```

---

## FASE 1: FUNDAMENTOS CRITICOS
**Semanas 1-4 | Prioridad: URGENTE**

### Objetivo
Completar funcionalidades core faltantes para ser una plataforma de gestion real, no solo de lectura.

---

### 1.1 Exponer Campaign Management CRUD

**Problema:** `meta-marketing/src/campaigns.ts` ya tiene implementados `createCampaign()`, `createAdSet()`, `createAd()`, `updateCampaign()`, `deleteCampaign()`, `duplicateCampaign()`, etc. Pero estos metodos **NO estan expuestos** en el controller ni en las rutas. Solo hay endpoints de lectura.

**Archivos a modificar:**

| Archivo | Accion |
|---------|--------|
| `routes/metaMarketingRoutes.ts` | Agregar rutas POST/PUT/DELETE |
| `controllers/MetaMarketingController.ts` | Agregar metodos de escritura |
| `services/MetaMarketingService/index.ts` | Agregar metodos de escritura que usen campaigns.ts |

**Codigo existente a reusar:**
```
meta-marketing/src/campaigns.ts:
  - createCampaign(params)     -> Crear campana con budget, dates, objective
  - createAdSet(params)        -> Crear ad set con targeting, optimization
  - createAdCreative(params)   -> Crear creative con titulo, body, imagen, video
  - createAd(params)           -> Crear ad con creative y ad set
  - updateCampaign(id, params) -> Actualizar nombre, status, budgets
  - updateAdSet(id, params)    -> Actualizar targeting, budgets, bids
  - updateAd(id, params)       -> Actualizar creative, status
  - deleteCampaign(id)         -> Eliminar campana
  - duplicateCampaign(id)      -> Clonar campana
  - batchPauseCampaign(id)     -> Pausar toda la jerarquia
  - batchActivateCampaign(id)  -> Activar toda la jerarquia
```

**Nuevos endpoints a crear:**
```
POST   /meta-marketing/campaigns              -> Crear campana
PUT    /meta-marketing/campaigns/:id           -> Actualizar campana
DELETE /meta-marketing/campaigns/:id           -> Eliminar campana
POST   /meta-marketing/campaigns/:id/duplicate -> Duplicar campana
POST   /meta-marketing/campaigns/:id/pause     -> Pausar campana + todos sus ads
POST   /meta-marketing/campaigns/:id/activate  -> Activar campana + todos sus ads
POST   /meta-marketing/adsets                  -> Crear ad set
PUT    /meta-marketing/adsets/:id              -> Actualizar ad set
POST   /meta-marketing/ads                     -> Crear ad
PUT    /meta-marketing/ads/:id                 -> Actualizar ad
```

**Validaciones requeridas:**
- Verificar que el usuario tiene acceso a la ad account
- Validar que el presupuesto es positivo
- Validar que las fechas de inicio/fin son coherentes
- Invalidar cache despues de cada operacion de escritura
- Log de auditoria para cada operacion (reusar `AuditLogger.ts`)

**Criterios de aceptacion:**
- [ ] Todos los endpoints responden correctamente
- [ ] Cache se invalida tras cada escritura
- [ ] Audit log registra cada operacion
- [ ] Errores de Meta API se manejan con mensajes claros
- [ ] Tests unitarios para cada endpoint

---

### 1.2 Corregir TODOs Existentes

#### TODO 1: Token limit hardcoded

**Archivo:** `services/CampaignRecommendationService.ts` linea 11

**Actual:**
```typescript
const TOKEN_LIMIT = 10000; // Hardcoded
```

**Propuesto:**
```typescript
// Obtener limite de tokens desde el subplan de IA de la empresa
const aiSubplan = await AISubplan.findOne({ where: { companyId } });
const tokenLimit = aiSubplan?.tokenLimit ?? 10000; // fallback seguro
```

**Archivos a revisar:**
- Modelo `AISubplan` - verificar que existe y tiene campo `tokenLimit`
- Si no existe, crear migracion para agregar el campo

#### TODO 2: Historical touchpoint lookback

**Archivo:** `services/AttributionService.ts` lineas 303-305

**Actual:**
```typescript
// En una implementacion real, esto buscaria en una tabla de touchpoints/sesiones
// Por ahora, retornamos un array vacio y manejamos solo el touchpoint actual
return [];
```

**Propuesto:**
```typescript
const lookbackDate = new Date();
lookbackDate.setDate(lookbackDate.getDate() - lookbackDays); // default 30 dias

return await AttributionTouchpoint.findAll({
  where: {
    contactId,
    createdAt: { [Op.gte]: lookbackDate }
  },
  order: [['createdAt', 'ASC']],
  limit: 50 // maximo touchpoints a considerar
});
```

**Impacto:** La atribucion multi-touch (linear, time-decay) ahora funcionara correctamente con datos historicos reales.

---

### 1.3 Sistema de Alertas de Rendimiento

**Nuevo archivo:** `services/CampaignAlertService.ts`
**Nuevo modelo:** `models/CampaignAlert.ts`
**Nuevo job:** `jobs/CampaignAlertEvaluator.ts`

**Modelo CampaignAlert:**
```
id: number (PK)
companyId: number (FK -> Company)
campaignId: string (Meta campaign ID)
alertType: enum ('cpa_high', 'ctr_low', 'budget_depleted', 'frequency_high', 'no_conversions', 'anomaly')
condition: JSON { metric: string, operator: string, value: number }
threshold: number
severity: enum ('info', 'warning', 'critical')
status: enum ('active', 'triggered', 'acknowledged', 'resolved')
triggeredAt: Date
acknowledgedAt: Date
notificationChannel: enum ('whatsapp', 'email', 'both', 'in_app')
notificationSent: boolean
metadata: JSON (datos de la metrica al momento del trigger)
```

**Alertas pre-configuradas:**

| Alerta | Condicion Default | Severidad | Accion |
|--------|-------------------|-----------|--------|
| CPA Alto | cost_per_conversion > 2x promedio 7d | warning | Notificar + sugerir pausar |
| CTR Bajo | CTR < 0.5% despues de 1000 impressions | warning | Notificar + sugerir cambio creativo |
| Budget Agotado | spend >= daily_budget * 90% | info | Notificar |
| Frecuencia Alta | frequency > 3.0 | warning | Notificar + sugerir nueva audiencia |
| Sin Conversiones | spend > $50 y conversions = 0 | critical | Notificar + sugerir revision urgente |
| Spend Anomalo | spend desvio > 2 std del promedio | critical | Notificar inmediatamente |

**Canales de notificacion:**
- WhatsApp: Reusar `services/WhatsappService/` existente para enviar al anunciante
- Email: Reusar `models/EmailMarketing/` existente
- In-app: Nueva columna en dashboard

**Job de evaluacion:**
- Frecuencia: cada 15 minutos
- Consulta insights de campanas activas
- Evalua cada alerta configurada
- Cooldown de 1 hora entre alertas del mismo tipo para la misma campana
- Reusar infraestructura de jobs existente en `/jobs/`

**Nuevos endpoints:**
```
GET    /meta-marketing/alerts                -> Listar alertas
POST   /meta-marketing/alerts               -> Crear alerta personalizada
PUT    /meta-marketing/alerts/:id           -> Actualizar alerta
DELETE /meta-marketing/alerts/:id           -> Eliminar alerta
PUT    /meta-marketing/alerts/:id/acknowledge -> Marcar como vista
GET    /meta-marketing/alerts/history       -> Historial de alertas triggered
```

---

### 1.4 Export Mejorado

**Archivo a modificar:** `controllers/MetaMarketingController.ts`
**Reusar:** `meta-marketing/src/insights.ts` ya tiene funcion `toCsv()`

**Dependencias nuevas:**
```
exceljs    -> Export XLSX
pdfkit     -> Export PDF (alternativa: puppeteer para HTML->PDF)
```

**Nuevos endpoints:**
```
GET /meta-marketing/export/csv?period=last_30_days&type=campaigns
GET /meta-marketing/export/xlsx?period=last_30_days&type=campaigns
GET /meta-marketing/export/pdf?period=last_30_days&type=campaigns
```

**Tipos de export:**
| Tipo | Contenido |
|------|-----------|
| campaigns | Tabla de campanas con metricas principales |
| ads | Tabla de ads con metricas por ad |
| trends | Datos de tendencia diaria |
| full_report | Campanas + ads + tendencias + metricas agregadas |

**Formato XLSX:**
- Hoja 1: Resumen (metricas agregadas)
- Hoja 2: Campanas (tabla con todas las metricas)
- Hoja 3: Ads (tabla con metricas por ad)
- Hoja 4: Tendencias (datos diarios)
- Formato condicional: verde (bueno), amarillo (atencion), rojo (problema)

**Formato PDF:**
- Header con logo de la empresa y periodo
- Metricas principales en tarjetas
- Tabla de campanas
- Grafico de tendencia
- Footer con fecha de generacion

---

### 1.5 Frontend: Formularios de Gestion

**Archivos frontend a modificar/crear:**
- Componente existente del dashboard de CampaignsInsights
- Nuevos componentes: CreateCampaignModal, EditCampaignModal, BulkActionsBar

**Nuevos componentes UI:**

| Componente | Funcion |
|------------|---------|
| **CreateCampaignModal** | Wizard de 3 pasos: 1) Config campana (nombre, objetivo, presupuesto) 2) Config ad set (targeting, optimization) 3) Config ad (creativo, copy, CTA) |
| **EditCampaignModal** | Edicion rapida de nombre, status, presupuesto |
| **CampaignActionsMenu** | Menu contextual: pausar, activar, duplicar, eliminar |
| **BulkActionsBar** | Barra superior con checkboxes para seleccion multiple + acciones bulk |
| **ExportMenu** | Dropdown con opciones CSV, XLSX, PDF |
| **AlertsBadge** | Indicador en header con conteo de alertas activas |

---

### Verificacion Fase 1

- [ ] CRUD de campanas funciona end-to-end (crear -> ver -> editar -> pausar -> eliminar)
- [ ] Token limit conectado a AISubplan
- [ ] Historical touchpoints implementado en AttributionService
- [ ] Alertas se evaluan cada 15 min y notifican por WhatsApp
- [ ] Export CSV/XLSX/PDF funciona para todos los tipos
- [ ] Frontend permite crear, editar y pausar campanas
- [ ] Tests unitarios para todos los nuevos endpoints
- [ ] Tests de integracion contra Meta API (sandbox mode)

---

## FASE 2: SEGMENTACION INTELIGENTE
**Semanas 5-8 | Prioridad: ALTA**

### Objetivo
Implementar segmentacion por temperatura de audiencia (framework Vilma Nunez), explorador de intereses ocultos y gestion de audiencias custom/lookalike.

---

### 2.1 Clasificacion de Audiencias por Temperatura

**Nuevo modelo:** `models/AudienceSegment.ts`

```
id: number (PK)
companyId: number (FK -> Company)
name: string
description: string
temperature: enum ('cold', 'warm', 'hot')
criteria: JSON {
  rules: [
    { field: 'ticketCount', operator: '>=', value: 1 },
    { field: 'lastMessageDays', operator: '<=', value: 30 },
    { field: 'tags', operator: 'includes', value: ['comprador'] }
  ],
  logic: 'AND' | 'OR'
}
contactCount: number (calculado)
metrics: JSON {
  avgConversionRate: number,
  avgOrderValue: number,
  avgResponseTime: number
}
syncedToMeta: boolean
metaAudienceId: string (si se sincronizo como Custom Audience)
status: enum ('active', 'inactive', 'syncing')
lastCalculated: Date
createdAt: Date
updatedAt: Date
```

**Nuevo servicio:** `services/AudienceTemperatureService.ts`

**Logica de clasificacion automatica:**

| Temperatura | Criterios | Datos usados |
|-------------|-----------|--------------|
| **Fria** | Sin tickets, sin mensajes, sin tags de engagement, creado hace <30 dias sin interaccion | `Contact.tickets.length === 0`, `Contact.messages.length === 0` |
| **Tibia** | 1+ tickets, mensajes recientes (<30 dias), tags de engagement, visitante web | `Contact.tickets.length >= 1`, `Contact.lastMessage < 30 dias` |
| **Caliente** | Compras previas, multiples interacciones (>5 tickets), tags de comprador, conversiones registradas | `Contact.tags.includes('comprador')`, `Contact.tickets.length > 5` |

**Modelos existentes a reusar:**
- `models/Contact.ts` - datos base del contacto
- `models/ContactTag.ts` - tags para segmentacion
- `models/Ticket.ts` - historial de interacciones
- `models/ContactList.ts` - listas existentes
- `models/ContactListItem.ts` - items en listas

**Job de recalculo:** Cada 6 horas, reclasificar contactos segun nuevas interacciones

**Nuevos endpoints:**
```
GET    /meta-marketing/audiences/segments          -> Listar segmentos
POST   /meta-marketing/audiences/segments          -> Crear segmento
PUT    /meta-marketing/audiences/segments/:id      -> Actualizar segmento
DELETE /meta-marketing/audiences/segments/:id      -> Eliminar segmento
GET    /meta-marketing/audiences/segments/:id/contacts -> Contactos del segmento
POST   /meta-marketing/audiences/segments/:id/sync -> Sincronizar con Meta Custom Audience
GET    /meta-marketing/audiences/temperature-distribution -> Distribucion frio/tibio/caliente
```

**Integracion con campanas:**
- Al crear campana, sugerir targeting segun temperatura:
  - Frio: Intereses amplios, Lookalike 5-10%
  - Tibio: Custom Audience de tibios, Retargeting web
  - Caliente: Custom Audience de calientes, Lookalike 1-2% de compradores

---

### 2.2 Explorador de Intereses

**Nuevo servicio:** `services/InterestExplorerService.ts`

**Funcionalidades:**

| Feature | Implementacion |
|---------|---------------|
| **Busqueda de intereses** | Graph API: `GET /search?type=adinterest&q={query}` |
| **Categorias** | Las 12 categorias de Vilma Nunez pre-cargadas |
| **Intereses ocultos** | Busqueda exhaustiva via API con variaciones de keywords |
| **Estimacion de audiencia** | Graph API: `GET /act_{id}/reachestimate` con intereses seleccionados |
| **Sugerencias por nicho** | Mapeo nicho -> intereses recomendados (base de conocimiento) |
| **Layering** | Combinaciones AND/OR de intereses para hiper-segmentacion |
| **Guardado** | Guardar sets de intereses favoritos por empresa |

**Nuevo modelo:** `models/SavedInterestSet.ts`
```
id, companyId, name, interests: JSON[], estimatedReach: number, lastUsed: Date
```

**Nuevos endpoints:**
```
GET  /meta-marketing/interests/search?q=fitness&locale=es_ES
GET  /meta-marketing/interests/categories
GET  /meta-marketing/interests/suggestions?niche=ecommerce
POST /meta-marketing/interests/estimate  (body: { interests: [...], geo: {...} })
POST /meta-marketing/interests/sets      -> Guardar set de intereses
GET  /meta-marketing/interests/sets      -> Listar sets guardados
```

**Base de conocimiento de nichos:**
```json
{
  "ecommerce": {
    "intereses_base": ["Online shopping", "E-commerce", "Shopify"],
    "intereses_ocultos": ["Etsy", "Mercado Libre", "Shopee", "Wish.com"],
    "comportamientos": ["Engaged shoppers", "Digital payments adopters"]
  },
  "fitness": {
    "intereses_base": ["Fitness", "Gym", "Weight training"],
    "intereses_ocultos": ["MyFitnessPal", "Strava", "CrossFit Games"],
    "comportamientos": ["Health and wellness buyers"]
  }
  // ... mas nichos
}
```

---

### 2.3 Audiencias Custom/Lookalike

**Nuevo servicio:** `services/AudienceManagerService.ts`

**Funcionalidades:**

| Feature | Implementacion |
|---------|---------------|
| **Custom Audience desde CRM** | Subir emails/phones hasheados de ContactList a Meta |
| **Sincronizacion periodica** | Actualizar audience cuando cambia la lista |
| **Lookalike desde mejores clientes** | Crear lookalike 1-10% desde custom audience |
| **Overlap analysis** | Detectar solapamiento entre audiencias |

**Reusar codigo existente:**
- `meta-marketing/src/conversions.ts` - ya tiene `prepareUserData()` con hashing SHA-256 de email, phone, nombre, ciudad, etc.
- `models/ContactList.ts` y `ContactListItem.ts` - listas de contactos

**Flujo de creacion de Custom Audience:**
```
1. Usuario selecciona ContactList del CRM
2. Sistema extrae emails/phones de contactos
3. Hash SHA-256 (reusar conversions.ts)
4. POST /act_{id}/customaudiences con datos hasheados
5. Meta procesa y calcula match rate
6. Guardar metaAudienceId en AudienceSegment
```

**Flujo de Lookalike:**
```
1. Usuario selecciona Custom Audience existente
2. Configura: pais destino + porcentaje (1-10%)
3. POST /act_{id}/customaudiences con subtype=LOOKALIKE
4. Meta crea lookalike
5. Disponible para targeting en nuevas campanas
```

**Nuevos endpoints:**
```
POST   /meta-marketing/audiences/custom                -> Crear custom audience desde ContactList
POST   /meta-marketing/audiences/custom/:id/sync       -> Re-sincronizar con datos actuales
POST   /meta-marketing/audiences/lookalike              -> Crear lookalike
GET    /meta-marketing/audiences                        -> Listar todas las audiencias Meta
GET    /meta-marketing/audiences/:id                    -> Detalle de audiencia
GET    /meta-marketing/audiences/:id/overlap?compare=ID -> Overlap analysis
DELETE /meta-marketing/audiences/:id                    -> Eliminar audiencia
```

---

### 2.4 Frontend: Panel de Segmentacion

**Nuevos componentes UI:**

| Componente | Funcion |
|------------|---------|
| **TemperatureDashboard** | Grafico circular mostrando distribucion frio/tibio/caliente. Cards con metricas por temperatura |
| **InterestExplorer** | Panel de busqueda con resultados, categorias desplegables, estimador de audiencia en tiempo real |
| **AudienceBuilder** | Wizard para crear audiencias: 1) Seleccionar fuente (CRM list, segmento, manual) 2) Configurar criterios 3) Previsualizar tamano 4) Crear en Meta |
| **AudienceList** | Tabla de audiencias con: nombre, tipo, tamano, fecha, status de sync |

---

### Verificacion Fase 2

- [ ] Contactos se clasifican automaticamente en frio/tibio/caliente
- [ ] Explorador de intereses muestra resultados de la API de Meta
- [ ] Intereses ocultos aparecen en busquedas exhaustivas
- [ ] Custom Audiences se crean desde ContactLists del CRM
- [ ] Lookalike Audiences se crean correctamente
- [ ] Estimacion de audiencia funciona en tiempo real
- [ ] Frontend muestra distribucion de temperatura
- [ ] Tests para cada nuevo servicio

---

## FASE 3: AUTOMATIZACION Y REGLAS
**Semanas 9-12 | Prioridad: ALTA**

### Objetivo
Implementar motor de reglas automatizadas (referencia: Revealbot), A/B testing framework y automatizacion de presupuesto.

---

### 3.1 Motor de Reglas Automatizadas

**Nuevo modelo:** `models/CampaignRule.ts`

```
id: number (PK)
companyId: number (FK)
name: string
description: string
scope: enum ('account', 'campaign', 'adset', 'ad')
scopeId: string (Meta ID del objeto, null si es account-wide)
conditions: JSON [
  {
    metric: 'cost_per_conversion',
    operator: '>',         // >, <, =, !=, between, increased_by, decreased_by
    value: 10,
    timeRange: 'last_3_days',  // periodo de evaluacion
    logic: 'AND'           // relacion con siguiente condicion
  }
]
actions: JSON [
  {
    type: 'pause',         // pause, activate, adjust_budget, notify, duplicate, change_bid
    params: {}             // parametros especificos de la accion
  }
]
frequency: enum ('every_15min', 'every_30min', 'hourly', 'every_6h', 'daily')
cooldownMinutes: number (default: 60)
status: enum ('active', 'paused', 'error')
lastExecuted: Date
lastTriggered: Date
executionCount: number
triggerCount: number
createdAt: Date
```

**Nuevo modelo:** `models/CampaignRuleLog.ts`
```
id, ruleId, executedAt, conditionsMet: boolean, actionsTaken: JSON, result: enum ('success', 'failed', 'skipped'), error: string
```

**Nuevo servicio:** `services/CampaignRuleService.ts`

**Condiciones soportadas (v1):**

| Metrica | Descripcion | Operadores |
|---------|-------------|-----------|
| spend | Gasto total | >, <, =, between |
| cost_per_conversion (CPA) | Costo por conversion | >, <, =, between |
| ctr | Click-through rate | >, <, =, between |
| cpc | Costo por click | >, <, =, between |
| cpm | Costo por mil impresiones | >, <, =, between |
| roas | Return on ad spend | >, <, =, between |
| frequency | Frecuencia promedio | >, <, = |
| impressions | Total impresiones | >, <, = |
| conversions | Total conversiones | >, <, = |
| reach | Alcance | >, <, = |
| days_active | Dias desde inicio | >, <, = |

**Operadores especiales:**
- `increased_by`: Metrica aumento X% vs periodo anterior
- `decreased_by`: Metrica disminuyo X% vs periodo anterior
- `between`: Rango de valores

**Acciones soportadas (v1):**

| Accion | Parametros | Descripcion |
|--------|-----------|-------------|
| `pause` | - | Pausar campana/adset/ad |
| `activate` | - | Activar campana/adset/ad |
| `adjust_budget` | `{ type: 'increase'|'decrease', amount: number, unit: 'percent'|'absolute' }` | Ajustar presupuesto +/-X% o +/-$X |
| `notify_whatsapp` | `{ recipientId: string, message: string }` | Enviar notificacion por WhatsApp |
| `notify_email` | `{ email: string, subject: string }` | Enviar notificacion por email |
| `duplicate` | `{ newName: string }` | Duplicar campana |
| `change_bid` | `{ amount: number }` | Cambiar bid amount |

**Nuevo job:** `jobs/CampaignRuleEvaluator.ts`
```
Frecuencia: cada 15 minutos (configurable)
Flujo:
  1. Obtener todas las reglas activas
  2. Para cada regla:
     a. Verificar cooldown (no evaluar si se triggero recientemente)
     b. Obtener insights del scope (campana/adset/ad)
     c. Evaluar condiciones
     d. Si todas las condiciones se cumplen:
        - Ejecutar acciones
        - Registrar en CampaignRuleLog
        - Actualizar lastTriggered
     e. Si hay error:
        - Registrar error
        - Si errores consecutivos > 3, pausar regla
  3. Actualizar lastExecuted en cada regla evaluada
```

**Nuevos endpoints:**
```
GET    /meta-marketing/rules              -> Listar reglas
POST   /meta-marketing/rules              -> Crear regla
PUT    /meta-marketing/rules/:id          -> Actualizar regla
DELETE /meta-marketing/rules/:id          -> Eliminar regla
PUT    /meta-marketing/rules/:id/pause    -> Pausar regla
PUT    /meta-marketing/rules/:id/activate -> Activar regla
GET    /meta-marketing/rules/:id/logs     -> Historial de ejecuciones
POST   /meta-marketing/rules/:id/test     -> Evaluar regla sin ejecutar acciones (dry run)
```

**Templates de reglas pre-configuradas:**

| Template | Condiciones | Acciones |
|----------|------------|---------|
| "Pausar CPA alto" | CPA > 2x promedio 7d durante 3 dias | Pausar + notificar |
| "Escalar ganadores" | ROAS > 3.0 durante 5 dias + spend < 80% budget | Aumentar budget 20% + notificar |
| "Combatir fatigue" | CTR disminuyo 30% + frequency > 3.0 | Notificar + sugerir nuevo creativo |
| "Proteger presupuesto" | Spend > 90% daily budget antes de las 14:00 | Reducir budget 20% + notificar |
| "Detectar muertos" | 0 conversiones + spend > $50 + activo > 3 dias | Pausar + notificar |

---

### 3.2 A/B Testing Framework

**Nuevo modelo:** `models/ABTest.ts`

```
id: number (PK)
companyId: number (FK)
name: string
hypothesis: string
type: enum ('creative', 'audience', 'copy', 'placement', 'bidding')
variants: JSON [
  {
    id: 'A',
    name: 'Control',
    metaObjectId: string,   // campaign/adset/ad ID
    metaObjectType: string, // 'campaign'|'adset'|'ad'
    budgetShare: 50         // porcentaje del presupuesto
  },
  {
    id: 'B',
    name: 'Variante',
    metaObjectId: string,
    metaObjectType: string,
    budgetShare: 50
  }
]
primaryMetric: string (metrica principal para determinar ganador, ej: 'cost_per_conversion')
secondaryMetrics: string[] (metricas adicionales a monitorear)
status: enum ('draft', 'running', 'paused', 'completed', 'cancelled')
winner: string (variant ID, null si no determinado)
confidence: number (nivel de confianza estadistica, 0-100)
requiredConfidence: number (default: 95)
minSampleSize: number (conversiones minimas por variante)
startDate: Date
endDate: Date
actualEndDate: Date
autoApplyWinner: boolean (automaticamente escalar ganador y pausar perdedor)
results: JSON { perVariant metrics snapshot }
createdAt: Date
```

**Nuevo servicio:** `services/ABTestService.ts`

**Flujo completo:**
```
1. CREAR TEST
   - Usuario define hipotesis y tipo
   - Selecciona/crea variantes (ej: 2 ads diferentes)
   - Define metrica principal (ej: CPA)
   - Define duracion minima y confidence requerido

2. LANZAR TEST
   - Verificar que variantes estan activas
   - Distribuir presupuesto segun budgetShare
   - Marcar status = 'running'

3. MONITOREAR (job automatico cada hora)
   - Obtener insights de cada variante
   - Calcular metricas por variante
   - Calcular significancia estadistica (Z-test para proporciones)
   - Si confidence >= requiredConfidence Y minSampleSize alcanzado:
     -> Declarar ganador
     -> Si autoApplyWinner: escalar ganador, pausar perdedor

4. COMPLETAR
   - Registrar resultados finales
   - Generar reporte comparativo
   - Notificar al usuario
```

**Calculo de significancia estadistica:**
```
Z-test para proporciones (conversion rates):
  p1 = conversions_A / impressions_A
  p2 = conversions_B / impressions_B
  p_pool = (conversions_A + conversions_B) / (impressions_A + impressions_B)
  SE = sqrt(p_pool * (1 - p_pool) * (1/impressions_A + 1/impressions_B))
  Z = (p1 - p2) / SE
  confidence = 1 - 2 * (1 - normalCDF(abs(Z)))
```

**Nuevos endpoints:**
```
GET    /meta-marketing/tests              -> Listar tests
POST   /meta-marketing/tests              -> Crear test
GET    /meta-marketing/tests/:id          -> Detalle con resultados en vivo
PUT    /meta-marketing/tests/:id          -> Actualizar test
POST   /meta-marketing/tests/:id/start    -> Iniciar test
POST   /meta-marketing/tests/:id/stop     -> Detener test
POST   /meta-marketing/tests/:id/apply-winner -> Aplicar ganador manualmente
DELETE /meta-marketing/tests/:id          -> Eliminar test
```

---

### 3.3 Automatizacion de Presupuesto

**Agregar a:** `services/MetaMarketingService/index.ts`
**Nuevo servicio auxiliar:** `services/BudgetOptimizationService.ts`

**Funcionalidades:**

| Feature | Descripcion |
|---------|-------------|
| **Budget Pacing** | Visualizar gasto proyectado vs real. Alerta si gasto va 20%+ mas rapido de lo esperado |
| **Budget Redistribucion** | Mover presupuesto automaticamente de campanas con ROAS bajo a campanas con ROAS alto |
| **Budget Scaling Rules** | Si ROAS > X por N dias consecutivos, aumentar budget Y%. Limitar incremento maximo diario |
| **Budget Protection** | Nunca exceder un budget maximo global. Pausar campanas si se alcanza limite de cuenta |

**Nuevo endpoint:**
```
GET  /meta-marketing/budget/pacing?period=this_month  -> Pacing actual vs proyectado
POST /meta-marketing/budget/redistribute              -> Redistribuir segun ROAS
GET  /meta-marketing/budget/recommendations           -> Sugerencias de ajuste
```

---

### 3.4 Frontend: Panel de Automatizacion

**Nuevos componentes UI:**

| Componente | Funcion |
|------------|---------|
| **RuleBuilder** | Constructor visual de reglas: seleccionar metrica -> operador -> valor -> accion. Logica AND/OR. Templates pre-cargados |
| **RulesList** | Tabla de reglas con toggle on/off, ultima ejecucion, conteo de triggers |
| **RuleLog** | Timeline de ejecuciones con resultado (exito/fallo/skip) |
| **ABTestDashboard** | Vista comparativa de variantes con metricas lado a lado, barra de confianza, indicador de ganador |
| **ABTestWizard** | Wizard de creacion: hipotesis -> variantes -> metricas -> configuracion |
| **BudgetPacingChart** | Grafico de linea: gasto real vs proyectado con zona de alerta |

---

### Verificacion Fase 3

- [ ] Motor de reglas evalua condiciones correctamente
- [ ] Acciones se ejecutan cuando se cumplen condiciones
- [ ] Cooldown funciona (no trigger repetitivo)
- [ ] A/B tests distribuyen presupuesto correctamente
- [ ] Calculo de significancia estadistica es preciso
- [ ] Ganador se detecta automaticamente al alcanzar confidence
- [ ] Budget pacing muestra datos correctos
- [ ] Templates de reglas se cargan correctamente
- [ ] Dry run funciona sin ejecutar acciones
- [ ] Tests unitarios y de integracion completos

---

## FASE 4: IA AVANZADA
**Semanas 13-18 | Prioridad: MEDIA-ALTA**

### Objetivo
IA predictiva y generativa para diagnostico profundo, generacion de copy por nivel de conciencia y scoring predictivo de creativos.

---

### 4.1 Diagnostico Inteligente de Campanas

**Archivo a mejorar:** `services/CampaignRecommendationService.ts`

**Nuevos modulos de diagnostico:**

| Diagnostico | Datos Analizados | Logica de Deteccion | Recomendacion |
|-------------|------------------|---------------------|---------------|
| **Creative Fatigue** | CTR ultimos 14d + frequency + edad del creativo | CTR decayendo >20% + frequency >2.5 + mismo creativo >10 dias | "Tu creativo muestra fatigue. CTR bajo de X% a Y% en 10 dias. Recomendamos rotar con nuevas variaciones." |
| **Audience Saturation** | Reach vs audience size + frequency + CPM trend | Reach estancado + frequency >3.0 + CPM subiendo >15% | "Tu audiencia esta saturada. Has alcanzado X% del total. Recomendamos expandir o crear lookalike." |
| **Bid Competition** | CPM trend por hora + CTR estable | CPM sube >20% pero CTR estable = competencia, no calidad | "La competencia por tu audiencia aumento. CPM subio X%. Considera cambiar horario de entrega o ampliar targeting." |
| **Learning Phase Stuck** | Conversiones en 7d + status | <50 conversiones en 7 dias + status learning | "Campana atrapada en fase de aprendizaje. Solo X conversiones en 7 dias. Simplifica la estructura o amplia audiencia." |
| **Budget Constraint** | Spend vs budget + metricas positivas | Spend = budget limit + ROAS > target | "Tu campana tiene buen rendimiento (ROAS X) pero esta limitada por presupuesto. Aumentar budget podria generar Y conversiones mas." |
| **Placement Mismatch** | Rendimiento por placement | Diferencia >50% en CPA entre placements | "El placement X tiene CPA de $Y vs $Z en otros. Recomendamos optimizar o excluir." |

**Formato de diagnostico mejorado:**
```json
{
  "diagnosis": "creative_fatigue",
  "severity": "high",
  "evidence": {
    "ctr_7d_ago": 2.5,
    "ctr_current": 1.8,
    "ctr_change": -28,
    "frequency": 3.2,
    "creative_age_days": 15
  },
  "impact": {
    "estimated_wasted_spend_daily": 25,
    "estimated_lost_conversions_daily": 3
  },
  "recommendations": [
    {
      "action": "rotate_creative",
      "description": "Crear 2-3 variaciones del creativo actual",
      "effort": "medium",
      "expected_improvement": "+20-30% CTR"
    },
    {
      "action": "launch_ab_test",
      "description": "Lanzar A/B test con nuevo creativo vs actual",
      "effort": "medium",
      "expected_improvement": "Validar mejora antes de full switch"
    }
  ],
  "one_click_actions": [
    { "label": "Duplicar campana con nuevo presupuesto", "endpoint": "/campaigns/{id}/duplicate" },
    { "label": "Pausar esta campana", "endpoint": "/campaigns/{id}/pause" }
  ]
}
```

---

### 4.2 Generacion de Copy/Hooks con IA

**Nuevo servicio:** `services/AdCopyGeneratorService.ts`

**Niveles de conciencia (Eugene Schwartz) con estrategia de copy:**

| Nivel | Descripcion | Estrategia de Hook | Ejemplo |
|-------|-------------|-------------------|---------|
| **1. Unaware** | No sabe que tiene un problema | Curiosidad, storytelling, datos impactantes | "El 87% de los negocios comete este error sin saberlo..." |
| **2. Problem-Aware** | Sabe del problema, no conoce soluciones | Empatia, agitar el dolor, validar la frustracion | "Cansado de gastar en publicidad sin ver resultados?" |
| **3. Solution-Aware** | Conoce soluciones, no te conoce a ti | Educacion, autoridad, diferenciacion | "Existe un metodo que las agencias top usan y que nadie te ha contado..." |
| **4. Product-Aware** | Te conoce pero no ha comprado | Prueba social, garantia, comparacion | "Mas de 5,000 negocios ya usan [producto] para duplicar sus ventas" |
| **5. Most-Aware** | Cliente o seguidor fiel | Oferta directa, exclusividad, urgencia | "Solo para clientes VIP: 40% OFF esta semana" |

**Prompt template para generacion (usar Claude API o OpenAI existente):**
```
Genera 5 variaciones de anuncio para Facebook Ads.

Contexto:
- Negocio: {business_type}
- Producto/Servicio: {product}
- Nivel de conciencia de la audiencia: {consciousness_level}
- Objetivo de campana: {objective}
- Tono: {tone}
- Restricciones: maximo {max_chars} caracteres en headline, {max_body} en body

Para nivel "{consciousness_level}", usa la estrategia:
{strategy_for_level}

Genera:
1. Hook/headline (primera linea que capta atencion)
2. Body (desarrollo del mensaje)
3. CTA (llamada a accion)

Formato JSON con score de 0-100 estimando efectividad.
```

**Nuevos endpoints:**
```
POST /meta-marketing/copy/generate
  Body: {
    businessType: string,
    product: string,
    consciousnessLevel: 1-5,
    objective: string,
    tone: 'professional'|'casual'|'urgent'|'empathetic',
    variations: number (1-10),
    maxHeadlineChars: number,
    maxBodyChars: number
  }

GET  /meta-marketing/copy/history          -> Historico de generaciones
POST /meta-marketing/copy/rate             -> Calificar copy generado (feedback loop)
GET  /meta-marketing/copy/templates        -> Templates por nivel de conciencia
```

---

### 4.3 Scoring Predictivo de Creativos

**Nuevo servicio:** `services/CreativeScoringService.ts`

**Factores de scoring:**

| Factor | Peso | Fuente de datos |
|--------|------|-----------------|
| **Historico del cliente** | 30% | Campanas anteriores de la misma empresa (metricas promedio) |
| **Calidad del texto** | 25% | Longitud, emociones, poder words, CTA clarity, nivel de conciencia match |
| **Coherencia audiencia-creativo** | 20% | Match entre targeting y mensaje |
| **Mejores practicas** | 15% | Benchmarks de la industria (CTR promedio, engagement rates) |
| **Novedad** | 10% | Cuanto difiere de creativos anteriores (anti-fatigue) |

**Score output:**
```json
{
  "overallScore": 78,
  "breakdown": {
    "historicalMatch": 82,
    "textQuality": 75,
    "audienceCoherence": 80,
    "bestPractices": 72,
    "novelty": 85
  },
  "improvements": [
    "El headline es demasiado largo (85 chars). Reducir a <65 chars mejora CTR +12%",
    "Falta CTA claro. Agregar verbo de accion puede mejorar conversion +8%",
    "El tono no coincide con el nivel de conciencia de la audiencia (tibia). Ajustar a tono educativo"
  ],
  "prediction": {
    "estimatedCTR": "1.8-2.4%",
    "estimatedCPC": "$0.45-0.65",
    "confidence": "medium"
  }
}
```

**Nuevo endpoint:**
```
POST /meta-marketing/creative/score
  Body: {
    headline: string,
    body: string,
    cta: string,
    imageUrl: string (opcional),
    targetAudience: { temperature, interests, demographics },
    objective: string
  }
```

---

### 4.4 Deteccion de Anomalias

**Agregar a:** `services/MetaMarketingService/index.ts`

**Algoritmos implementados:**

| Algoritmo | Uso | Formula |
|-----------|-----|---------|
| **Z-Score** | Metricas con distribucion normal (CTR, CPC) | z = (x - media) / stddev. Anomalia si abs(z) > 2 |
| **IQR** | Metricas con outliers (spend, conversions) | Q1, Q3, IQR = Q3-Q1. Anomalia si x < Q1-1.5*IQR o x > Q3+1.5*IQR |
| **Media Movil** | Tendencias (comparar hoy vs media 7/14/30d) | Anomalia si cambio > 30% vs media movil |

**Metricas monitoreadas:**
- CTR (caida subita = problema de creativo o audiencia)
- CPA (subida subita = problema de conversion)
- CPM (subida subita = competencia o calidad)
- Spend (desvio del pacing normal)
- Conversiones (caida a 0 = tracking roto o campana muerta)
- Reach (estancamiento = saturacion)

**Visualizacion:**
- Highlights en dashboard: icono de alerta junto a metricas anormales
- Tooltip con explicacion: "CTR bajo 35% vs promedio de 7 dias. Posible creative fatigue."
- Timeline de anomalias en vista de tendencias

**Nuevo endpoint:**
```
GET /meta-marketing/anomalies?period=last_7_days
  Response: [
    {
      campaignId: string,
      campaignName: string,
      metric: 'ctr',
      currentValue: 1.2,
      expectedValue: 2.1,
      deviation: -43,
      severity: 'high',
      possibleCause: 'creative_fatigue',
      detectedAt: Date
    }
  ]
```

---

### Verificacion Fase 4

- [ ] Diagnostico identifica correctamente creative fatigue, audience saturation, etc.
- [ ] Copy generator produce variaciones coherentes por nivel de conciencia
- [ ] Scoring predictivo genera scores consistentes
- [ ] Anomalias se detectan cuando metricas se desvian >30%
- [ ] Feedback loop de copy funciona (calificaciones mejoran futuras generaciones)
- [ ] One-click actions funcionan desde diagnostico
- [ ] Tests con datos historicos reales

---

## FASE 5: INTEGRACIONES Y OMNICANALIDAD
**Semanas 19-24 | Prioridad: MEDIA**

### Objetivo
Optimizar CTWA, integrar WhatsApp Flows, implementar reportes automatizados y actualizaciones en tiempo real.

---

### 5.1 Dashboard CTWA Especializado

**Mejorar:** `services/FacebookConversionService/SendConversionEvent.ts`

**Metricas CTWA unicas:**

| Metrica | Calculo | Fuente |
|---------|---------|--------|
| Costo por conversacion WA | ad_spend / whatsapp_conversations_initiated | Meta Insights + CTWA events |
| Tasa de conversion WA | conversions / whatsapp_conversations | Conversions API + Contact data |
| Valor por conversacion | total_revenue / whatsapp_conversations | CRM data |
| Tiempo primera respuesta | avg(first_agent_reply - conversation_start) | Ticket/Message timestamps |
| CTWA vs Landing page CPA | comparativa lado a lado | Insights por objective |

**Funnel CTWA:**
```
Ad Impressions -> Ad Clicks -> WA Conversations Initiated -> Messages Exchanged -> Leads Qualified -> Conversions
```

**Nuevo endpoint:**
```
GET /meta-marketing/ctwa-dashboard?period=last_30_days
  Response: {
    funnel: { impressions, clicks, conversations, leads, conversions },
    conversionRates: { click_to_wa, wa_to_lead, lead_to_conversion },
    costs: { per_click, per_conversation, per_lead, per_conversion },
    comparison: { ctwa_cpa, landing_cpa, ctwa_advantage_percent },
    topCampaigns: [...],
    trends: { daily_conversations, daily_conversions }
  }
```

---

### 5.2 WhatsApp Flows Integration

**Nuevo servicio:** `services/WhatsAppFlowsService.ts`

**Funcionalidades:**
- Crear formularios nativos in-chat (lead capture, encuestas, registros)
- Funnels de compra dentro de WhatsApp
- Tracking de completion rate por step
- Integracion: CTWA Ad -> WhatsApp Flow -> Conversion tracking

---

### 5.3 Reportes Automatizados

**Nuevo servicio:** `services/ReportSchedulerService.ts`
**Nuevo modelo:** `models/ScheduledReport.ts`

```
id, companyId, name
frequency: enum ('daily', 'weekly', 'monthly')
dayOfWeek: number (para weekly, 0=domingo)
dayOfMonth: number (para monthly)
hour: number (hora de envio)
timezone: string
recipients: JSON [{ type: 'email'|'whatsapp', address: string }]
template: enum ('summary', 'detailed', 'executive', 'custom')
filters: JSON { campaigns, period, metrics }
format: enum ('pdf', 'xlsx', 'both')
includeComparison: boolean (MoM, WoW)
status: enum ('active', 'paused')
lastSent: Date
```

**Templates de reportes:**

| Template | Contenido |
|----------|-----------|
| **Summary** | Metricas clave + top 3 campanas + alertas |
| **Detailed** | Todas las campanas + ads + tendencias + anomalias |
| **Executive** | ROI total + comparativa periodos + recomendaciones top 3 |
| **Custom** | Usuario selecciona metricas y campanas a incluir |

**Job de envio:** Verificar cada hora si hay reportes programados para enviar

**Nuevos endpoints:**
```
GET    /meta-marketing/reports/scheduled       -> Listar reportes programados
POST   /meta-marketing/reports/scheduled       -> Crear reporte programado
PUT    /meta-marketing/reports/scheduled/:id   -> Actualizar
DELETE /meta-marketing/reports/scheduled/:id   -> Eliminar
POST   /meta-marketing/reports/generate-now    -> Generar reporte inmediato
GET    /meta-marketing/reports/history         -> Historial de reportes enviados
```

---

### 5.4 Actualizaciones en Tiempo Real

**Nuevo servicio:** `services/CampaignWebhookService.ts`

**WebSocket events (reusar Socket.io existente):**

| Evento | Trigger | Data |
|--------|---------|------|
| `campaign:alert` | Alerta triggered | Alert object |
| `campaign:rule_executed` | Regla ejecutada | Rule + resultado |
| `campaign:anomaly` | Anomalia detectada | Anomaly object |
| `campaign:budget_warning` | Budget >80% | Campaign + spend |
| `campaign:test_winner` | A/B test determino ganador | Test + winner |
| `campaign:status_changed` | Campana cambio de status | Campaign + old/new status |

**Implementacion:**
- Emitir eventos desde cada servicio cuando ocurren cambios
- Frontend escucha via Socket.io existente
- Badge de notificaciones en tiempo real

---

### Verificacion Fase 5

- [ ] Dashboard CTWA muestra funnel completo con metricas
- [ ] Comparativa CTWA vs landing page es precisa
- [ ] Reportes programados se envian en horario correcto
- [ ] PDF y XLSX generados correctamente
- [ ] Reportes llegan por WhatsApp y email
- [ ] WebSocket emite eventos en tiempo real
- [ ] Frontend actualiza sin refresh manual

---

## FASE 6: DIFERENCIACION COMPETITIVA
**Semanas 25-30 | Prioridad: ESTRATEGICA**

### Objetivo
Implementar 3 features que NINGUN competidor ofrece actualmente, creando ventaja competitiva sustentable.

---

### 6.1 Segmentacion por Niveles de Conciencia Automatizada

**FEATURE UNICO EN EL MERCADO - Ningun competidor lo automatiza con IA**

**Nuevo servicio:** `services/ConsciousnessLevelService.ts`

**Niveles (Eugene Schwartz):**

| Nivel | Criterios de Clasificacion Automatica |
|-------|--------------------------------------|
| **1. Unaware** | Contact nuevo (<7 dias), sin interacciones, fuente = cold ad, 0 mensajes |
| **2. Problem-Aware** | Ha enviado mensajes con keywords de problema ("necesito", "busco", "tengo problema con"), visitado contenido informativo |
| **3. Solution-Aware** | Ha preguntado por soluciones especificas, descargado lead magnet, interactuado con chatbot >3 veces, pedido demo/info |
| **4. Product-Aware** | Ha preguntado precio/disponibilidad, visitado pagina de producto, pedido cotizacion por WhatsApp, anadido al carrito |
| **5. Most-Aware** | Cliente previo (1+ compras), NPS alto, engagement recurrente (>10 interacciones en 30 dias), referido a otros |

**Datos usados para clasificacion automatica:**

| Fuente de datos | Modelo existente | Campo |
|----------------|-----------------|-------|
| Mensajes WhatsApp | `Message` | content (NLP keywords), direction, timestamp |
| Tags CRM | `ContactTag` | tag names (comprador, lead, demo, etc.) |
| Tickets | `Ticket` | count, status, channel |
| Historial de campanas | `FacebookConversionEvent` | eventName (Purchase, Lead, AddToCart, ViewContent) |
| Contact metadata | `Contact` | createdAt, lastInteraction, customFields |
| Conversaciones bot | Chatbot logs | intent detected, flow completed |

**Algoritmo de clasificacion:**
```
Para cada contacto:
  1. Calcular score por nivel (0-100)
     - Level 5: compras + engagement recurrente
     - Level 4: interes en producto + pregunta precio
     - Level 3: busqueda de soluciones + lead magnet
     - Level 2: keywords de problema + contenido informativo
     - Level 1: sin interacciones significativas

  2. Asignar nivel = el mas alto con score > threshold (default 60)

  3. Si score es ambiguo (2 niveles >50): asignar el mas alto

  4. Registrar en Contact.consciousnessLevel con confidence score
```

**Integracion con campanas:**
```
Al crear campana:
  1. Sistema analiza la lista de contactos/audiencia
  2. Determina nivel de conciencia dominante
  3. Sugiere:
     - Tipo de campana (awareness vs conversion)
     - Copy adaptado al nivel (generado en Fase 4.2)
     - Oferta apropiada (educacion vs descuento)
     - CTA optimal (aprender mas vs comprar ahora)
  4. Auto-genera 3 variaciones de ad copy para el nivel
```

**Nuevo modelo (agregar a Contact):**
```
consciousnessLevel: enum (1, 2, 3, 4, 5)
consciousnessScore: number (0-100)
consciousnessLastCalculated: Date
consciousnessHistory: JSON [{ level, score, date }]
```

**Nuevos endpoints:**
```
GET  /meta-marketing/consciousness/distribution         -> Distribucion de niveles en base de contactos
GET  /meta-marketing/consciousness/contact/:id          -> Nivel de un contacto especifico
POST /meta-marketing/consciousness/recalculate          -> Forzar recalculo
GET  /meta-marketing/consciousness/campaign-suggestion   -> Sugerencia de campana segun nivel dominante
POST /meta-marketing/consciousness/analyze-audience     -> Analizar audiencia y sugerir estrategia
```

---

### 6.2 Ciclo Diagnostico-Reconstruccion Integrado

**FEATURE UNICO EN EL MERCADO - Ni Madgicx ni AdCreative.ai lo ofrecen completo**

**Nuevo servicio:** `services/AdReconstructionService.ts`

**Flujo automatizado completo:**

```
PASO 1: DETECTAR (automatico, cada hora)
  Criterios de deteccion:
  - CTR cayo >25% vs media 7 dias
  - CPA subio >40% vs media 7 dias
  - Frequency >3.0 y subiendo
  - 0 conversiones en ultimas 48h con spend >$30

PASO 2: DIAGNOSTICAR (automatico)
  Motor de diagnostico (reusar Fase 4.1):
  - Creative fatigue? -> Revisar edad del creativo + CTR trend
  - Audience saturation? -> Revisar reach/audience_size + frequency
  - Copy misalignment? -> Revisar CTR desde inicio (si siempre fue bajo = copy malo)
  - Algorithmic penalty? -> CPM sube sin razon + quality ranking bajo
  - Landing page issue? -> CTR alto pero conversiones bajas

PASO 3: RECONSTRUIR (semi-automatico)
  Segun diagnostico:

  Si creative_fatigue:
    -> Generar 3 variaciones del copy actual (reusar Fase 4.2)
    -> Sugerir nuevos angulos basados en nivel de conciencia de audiencia
    -> Preparar nuevos ads listos para lanzar

  Si audience_saturation:
    -> Sugerir nueva audiencia basada en explorador de intereses (Fase 2.2)
    -> Crear lookalike automatico desde converters (Fase 2.3)
    -> Preparar nuevo adset con audiencia expandida

  Si copy_misalignment:
    -> Analizar nivel de conciencia de la audiencia
    -> Regenerar copy alineado al nivel correcto
    -> Sugerir hooks neurales apropiados

  Si algorithmic_penalty:
    -> Sugerir restructurar campana (nuevo nombre, nueva estructura)
    -> Recomendar periodo de "descanso" de la audiencia

  Si landing_page_issue:
    -> Sugerir revisar landing page (fuera de scope de ads)
    -> Mientras tanto, probar CTWA como alternativa

PASO 4: LANZAR COMO A/B TEST (un click)
  -> Crear variante B con la reconstruccion
  -> A/B test automatico: original vs reconstruido
  -> Distribucion 50/50 del presupuesto
  -> Monitorear 3-7 dias

PASO 5: EVALUAR Y APRENDER
  -> Cuando A/B test determina ganador:
     Si reconstruccion gana: escalar, pausar original
     Si original gana: descartar reconstruccion, ajustar modelo
  -> Registrar resultado para mejorar futuras reconstrucciones
  -> Actualizar base de conocimiento de que funciona
```

**Nuevo modelo:** `models/AdReconstruction.ts`
```
id, companyId, originalAdId, originalCampaignId
diagnosis: JSON (resultado del diagnostico)
reconstructionType: enum ('creative', 'audience', 'copy', 'structure')
reconstructedElements: JSON (que se cambio)
newAdId: string (Meta ID del ad reconstruido)
abTestId: number (FK -> ABTest)
status: enum ('diagnosed', 'reconstructed', 'testing', 'winner_original', 'winner_reconstruction', 'failed')
improvementMetrics: JSON (antes vs despues)
createdAt, completedAt
```

**Nuevos endpoints:**
```
GET  /meta-marketing/reconstruction/candidates       -> Campanas que necesitan reconstruccion
POST /meta-marketing/reconstruction/diagnose/:adId   -> Diagnosticar un ad especifico
POST /meta-marketing/reconstruction/generate/:adId   -> Generar reconstruccion
POST /meta-marketing/reconstruction/launch/:id       -> Lanzar como A/B test
GET  /meta-marketing/reconstruction/history          -> Historial de reconstrucciones
GET  /meta-marketing/reconstruction/learnings        -> Patrones aprendidos
```

---

### 6.3 Atribucion Omnicanal WhatsApp-First

**FEATURE UNICO EN EL MERCADO - Nadie combina atribucion de ads con journeys de WhatsApp**

**Mejorar:** `services/AttributionService.ts`

**Journey completo trackeable:**
```
1. Ad Impression (Meta Ads)
   -> Track: campaign_id, ad_id, creative_id, placement

2. Ad Click (Meta Ads)
   -> Track: click_time, fbclid/ctwa_clid

3. WhatsApp Conversation Initiated (CTWA)
   -> Track: conversation_start, source_ad, first_message
   -> Touchpoint: 'whatsapp_conversation_start'

4. Messages Exchanged (WhatsApp/CRM)
   -> Track: message_count, topics_discussed, agent_involved
   -> Touchpoints: cada interaccion significativa

5. Lead Qualified (Chatbot/Agent)
   -> Track: qualification_criteria_met, qualification_time
   -> Touchpoint: 'lead_qualified'

6. Conversion (Purchase/Registration/Appointment)
   -> Track: conversion_value, conversion_type, attribution_model
   -> Touchpoint: 'conversion'
   -> Send to Meta CAPI (reusar conversions.ts)
```

**Nuevos tipos de touchpoint para AttributionTouchpoint:**
```
- 'ad_impression'
- 'ad_click'
- 'whatsapp_conversation_start'    // NUEVO
- 'whatsapp_message_received'       // NUEVO
- 'whatsapp_message_sent'           // NUEVO
- 'chatbot_interaction'             // NUEVO
- 'agent_handoff'                   // NUEVO
- 'lead_qualified'                  // NUEVO
- 'proposal_sent'                   // NUEVO
- 'conversion'
```

**Dashboard unificado:**

| Metrica | Calculo |
|---------|---------|
| **Ad Spend -> Revenue** | Total spend / Total revenue por canal |
| **Cost per WA Conversation** | Ad spend CTWA / Conversations initiated |
| **Cost per Qualified Lead** | Ad spend / Leads qualified (via WA) |
| **Cost per Sale** | Ad spend / Conversions (purchases) |
| **WA Conversation -> Sale Rate** | Sales / WA conversations |
| **Avg Journey Duration** | Promedio de tiempo desde ad click hasta conversion |
| **Touchpoints per Conversion** | Promedio de interacciones antes de convertir |
| **LTV by Source** | Lifetime value de clientes por fuente (CTWA vs organic vs landing) |

**Comparativa de canales:**
```
CTWA Campaign  -> WA Conv -> Lead -> Sale : CPA $X, Conv Rate Y%, Avg Time Z dias
Landing Page   -> Form    -> Lead -> Sale : CPA $X, Conv Rate Y%, Avg Time Z dias
Organic WA     -> Conv    -> Lead -> Sale : CPA $0, Conv Rate Y%, Avg Time Z dias
```

**Nuevos endpoints:**
```
GET /meta-marketing/attribution/journey/:contactId    -> Journey completo de un contacto
GET /meta-marketing/attribution/channel-comparison    -> Comparativa CTWA vs landing vs organic
GET /meta-marketing/attribution/funnel                -> Funnel completo con drop-offs
GET /meta-marketing/attribution/ltv-by-source         -> LTV por fuente de adquisicion
GET /meta-marketing/attribution/touchpoint-analysis   -> Analisis de touchpoints mas efectivos
```

---

### 6.4 Frontend: Panel de Diferenciacion

**Nuevos componentes UI:**

| Componente | Funcion |
|------------|---------|
| **ConsciousnessMap** | Visualizacion tipo embudo de los 5 niveles con conteo de contactos y sugerencias de accion por nivel |
| **ReconstructionPipeline** | Vista de campanas diagnosticadas -> en reconstruccion -> en testing -> resultados. Acciones de un click |
| **JourneyTimeline** | Timeline visual del journey de un contacto desde ad impression hasta conversion, mostrando cada touchpoint |
| **ChannelComparisonChart** | Barras comparativas CTWA vs Landing vs Organic en metricas clave |
| **ConsciousnessHeatmap** | Mapa de calor mostrando que nivel de conciencia convierte mejor por tipo de campana |

---

### Verificacion Fase 6

- [ ] Clasificacion de conciencia asigna niveles correctamente basado en datos reales
- [ ] Sugerencias de campana por nivel son coherentes
- [ ] Ciclo diagnostico-reconstruccion funciona end-to-end
- [ ] Reconstrucciones se lanzan como A/B tests correctamente
- [ ] Atribucion WhatsApp-first trackea journey completo
- [ ] Comparativa de canales muestra datos precisos
- [ ] Todos los dashboards nuevos renderizan correctamente
- [ ] Tests de integracion para cada feature unico

---

## RESUMEN DE ENTREGABLES POR FASE

| Fase | Servicios nuevos | Modelos nuevos | Endpoints nuevos | Componentes UI |
|------|-----------------|----------------|-----------------|----------------|
| **1** | CampaignAlertService | CampaignAlert | ~15 | CreateCampaignModal, BulkActions, ExportMenu |
| **2** | AudienceTemperatureService, InterestExplorerService, AudienceManagerService | AudienceSegment, SavedInterestSet | ~15 | TemperatureDashboard, InterestExplorer, AudienceBuilder |
| **3** | CampaignRuleService, ABTestService, BudgetOptimizationService | CampaignRule, CampaignRuleLog, ABTest | ~20 | RuleBuilder, ABTestDashboard, BudgetPacingChart |
| **4** | AdCopyGeneratorService, CreativeScoringService | - (mejoras a existentes) | ~10 | DiagnosticPanel, CopyGenerator, ScoreCard |
| **5** | ReportSchedulerService, CampaignWebhookService, WhatsAppFlowsService | ScheduledReport | ~15 | CTWADashboard, ReportBuilder, RealTimeNotifications |
| **6** | ConsciousnessLevelService, AdReconstructionService | AdReconstruction | ~15 | ConsciousnessMap, ReconstructionPipeline, JourneyTimeline |

**Total estimado:** ~6 servicios nuevos principales, ~8 modelos nuevos, ~90 endpoints, ~15 componentes UI

---

## DEPENDENCIAS ENTRE FASES

```
Fase 1 (Fundamentos)
  |
  ├── Fase 2 (Segmentacion) -- necesita CRUD para crear campanas con audiencias
  |     |
  |     └── Fase 6.1 (Conciencia) -- necesita segmentos de temperatura como base
  |
  ├── Fase 3 (Automatizacion) -- necesita CRUD para ejecutar acciones automaticas
  |     |
  |     └── Fase 6.2 (Reconstruccion) -- necesita A/B testing + reglas
  |
  └── Fase 4 (IA) -- necesita insights expuestos para alimentar diagnostico
        |
        └── Fase 5 (Integraciones) -- necesita alertas + diagnostico para reportes
              |
              └── Fase 6.3 (Atribucion WA) -- necesita CTWA dashboard + touchpoints
```

**Fases paralelizables:**
- Fase 2 y Fase 3 pueden desarrollarse en paralelo (equipos diferentes)
- Fase 4.2 (Copy Generator) puede empezar durante Fase 3
- Fase 5.3 (Reportes) puede empezar durante Fase 4
