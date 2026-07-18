# Simulación de Conversación - Flujo de Venta con Cita

## Escenario: Cliente interesa en producto y agenda cita para concretarla

---

### **Mensaje 1: Primer Contacto**
```
👤 Cliente: "Hola, me interesa saber más sobre你们的 productos"
```

| Campo | Valor |
|-------|-------|
| **Intención detectada** | `greeting` |
| **Agente** | `self` (respuesta automática) |
| **Confianza** | 0.95 |
| **Etapa Kanban** | (sin cambio) |
| **Respuesta del sistema** | "¡Hola! 👋 Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?"

---

### **Mensaje 2: Consulta de Información**
```
👤 Cliente: "Tengo una empresa de construcción y necesito herramientas industriales"
```

| Campo | Valor |
|-------|-------|
| **Intención detectada** | `product_info` |
| **Agente** | `rag` (busca en knowledge base) |
| **Confianza** | 0.85 |
| **Etapa Kanban** | `new` → `contact` |
| **Respuesta del sistema** | "Contamos con las siguientes herramientas industriales para construcción: [lista de productos de la base de conocimientos]"

---

### **Mensaje 3: Consulta de Precios**
```
👤 Cliente: "¿Cuánto cuesta el taladro profesional? Necesito cotización para 10 unidades"
```

| Campo | Valor |
|-------|-------|
| **Intención detectada** | `sales_inquiry` |
| **Agente** | `sales` (agente de ventas con tools) |
| **Confianza** | 0.90 |
| **Etapa Kanban** | `contact` → `qualified` |
| **Acción** | El agente consulta precio en BD, calcula descuento por volumen |
| **Respuesta del sistema** | "El taladro profesional tiene un precio de $150 USD unidad. Para 10 unidades podemos ofrecerte un 15% de descuento, quedan en $127.50 cada uno. ¿Te interesa?"

---

### **Mensaje 4: Interés en Ver el Producto**
```
👤 Cliente: "Me interesa, me gustaría ver el producto antes de comprar. ¿Tienen showroom?"
```

| Campo | Valor |
|-------|-------|
| **Intención detectada** | `interest` → `appointment_request` |
| **Agente** | `sales` → `appointment` |
| **Confianza** | 0.88 |
| **Etapa Kanban** | `qualified` → `proposal` |
| **Acción** | El sistema detecta intención de cita |
| **Respuesta del sistema** | "¡Perfecto! Podemos agendar una cita en nuestro showroom para que veas el producto. ¿Qué día te gustaría venir? Tenemos disponibilidad esta semana."

---

### **Mensaje 5: El Cliente Agenda la Cita**
```
👤 Cliente: "Sí, me gustaría ir el viernes a las 4 de la tarde"
```

| Campo | Valor |
|-------|-------|
| **Intención detectada** | `appointment_request` |
| **Agente** | `appointment` (subagente de citas) |
| **Confianza** | 0.95 |
| **Etapa Kanban** | `proposal` → `negotiation` |
| **Fecha extraída** | viernes (próximo viernes desde hoy) |
| **Hora extraída** | 16:00 (4 PM) |
| **Acción** | ✅ Crea cita en BD |
| **Respuesta del sistema** | "¡Cita agendada exitosamente! 📅

*Servicio:* Demostración de Taladro Profesional
*Fecha:* viernes, 14 de marzo
*Hora:* 16:00

¿Confirmas esta cita?"

---

## 📊 Resumen del Flujo

| # | Mensaje | Intención | Etapa Kanban | Acción |
|---|---------|-----------|--------------|--------|
| 1 | Hola | `greeting` | - | Saludo automático |
| 2 | info productos | `product_info` | `contact` | Búsqueda RAG |
| 3 | precio/cotización | `sales_inquiry` | `qualified` | Agent Ventas |
| 4 | quiero ver producto | `appointment_request` | `proposal` | Detecta cita |
| 5 | viernes 4pm | `appointment_request` | `negotiation` | ✅ Crea cita |

---

## 🎯 Clasificación de Etapas del Kanban

```
new ──► contact ──► qualified ──► proposal ──► negotiation ──► closed
  │         │            │            │              │
  └──────────┴──────────┴────────────┴──────────────┘
        (El agente va agregando tags según la conversación)
```

---

## ✅ Verificación

- [x] **Mensaje 1**: Clasifica greeting → responde automáticamente
- [x] **Mensaje 2**: Clasifica product_info → RAG busca en knowledge base
- [x] **Mensaje 3**: Clasifica sales_inquiry → Agent Ventas responde con precio
- [x] **Mensaje 4**: Detecta intención de cita → cambia a Appointment Agent
- [x] **Mensaje 5**: Extrae fecha/hora → **CREA LA CITA EN BD**

**La cita se guarda correctamente en la tabla `appointments` con:**
- `status: "scheduled"`
- `companyId`, `contactId`, `ticketId`
- `startTime`, `endTime` calculados
- `title` = nombre del servicio

---

## 📝 Próximas Mejoras Sugeridas

1. **Confirmar automáticamente la cita** si el cliente responde "sí"
2. **Notificar al vendedor** cuando se agenda una cita
3. **Verificar disponibilidad** antes de crear la cita
4. **Integrar con calendario** de Google/Outlook
