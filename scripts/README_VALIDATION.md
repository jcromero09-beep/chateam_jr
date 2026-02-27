# 📋 Scripts de Validación - JR Chateam v6.0.0

Scripts automatizados para validar la implementación completa de las fases del proyecto.

---

## 🎯 Script: validate-whatsapp-cloud-api.js

### Propósito

Valida la implementación completa de la **Fase 9: WhatsApp Cloud API Integration**, verificando:
- ✅ Archivos requeridos (migraciones, modelos, servicios, controladores, rutas)
- ✅ Estructura de base de datos (tablas y funciones SQL)
- ✅ Modelos Sequelize (clases, campos, asociaciones, decorators)
- ✅ Servicios (métodos, líneas de código, imports)
- ✅ Controladores y rutas (endpoints, middleware)
- ✅ Configuración y helpers
- ✅ Documentación
- ✅ Dependencias y variables de entorno

---

## 🚀 Uso

### Ejecución Básica

```bash
# Desde la raíz del proyecto
node scripts/validate-whatsapp-cloud-api.js
```

### Con npm script (recomendado)

Agregue a `package.json`:

```json
{
  "scripts": {
    "validate:whatsapp": "node scripts/validate-whatsapp-cloud-api.js"
  }
}
```

Luego ejecute:

```bash
npm run validate:whatsapp
```

---

## 📊 Output del Script

### Formato de Salida

El script genera un reporte detallado con 8 secciones:

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║  VALIDACIÓN FASE 9: WHATSAPP CLOUD API INTEGRATION            ║
║  JR Chateam v6.0.0                                            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

═══ 1. Validación de Archivos Requeridos ═══

ℹ Validando migrations...
✓   ✓ 20251006_whatsapp_cloud_base.sql
✓   ✓ 20251006_message_templates.sql
✓   ✓ 20251006_media_management.sql
✓   ✓ 20251006_webhooks_events.sql
✓   ✓ 20251006_business_profiles.sql

ℹ Validando models...
✓   ✓ WhatsAppCloudConnection.ts
✓   ✓ WhatsAppMessageTemplate.ts
...

═══ 2. Validación de Migraciones de Base de Datos ═══

ℹ Validando 20251006_whatsapp_cloud_base.sql...
✓   ✓ Tabla: whatsapp_cloud_connections
✓   ✓ Tabla: whatsapp_cloud_phone_numbers
✓   ✓ Función: create_whatsapp_cloud_connection
✓   ✓ Función: validate_cloud_credentials
ℹ   📊 250 líneas de código

...

═══ 📊 REPORTE FINAL DE VALIDACIÓN ═══

Total de Pruebas: 85
Exitosas: 78
Fallidas: 3
Advertencias: 4
Tasa de Éxito: 91.8%
Estado: EXCELENTE

Resultados por Categoría:

✓ Archivos: 18/20 (90%) | Advertencias: 0
✓ Migraciones: 25/25 (100%) | Advertencias: 1
✓ Modelos: 22/25 (88%) | Advertencias: 2
✓ Servicios: 18/20 (90%) | Advertencias: 3
...
```

### Código de Salida

```bash
# Exit code 0: Validación exitosa (≥75% éxito, 0 errores críticos)
echo $?  # 0

# Exit code 1: Validación fallida (<75% éxito o errores críticos)
echo $?  # 1
```

---

## 🔍 Qué Valida el Script

### 1. Archivos Requeridos (20 archivos)

**Migraciones (5 archivos):**
- ✅ `20251006_whatsapp_cloud_base.sql`
- ✅ `20251006_message_templates.sql`
- ✅ `20251006_media_management.sql`
- ✅ `20251006_webhooks_events.sql`
- ✅ `20251006_business_profiles.sql`

**Modelos (5 archivos):**
- ✅ `WhatsAppCloudConnection.ts`
- ✅ `WhatsAppMessageTemplate.ts`
- ✅ `WhatsAppMedia.ts`
- ✅ `WhatsAppWebhookEvent.ts`
- ✅ `WhatsAppBusinessProfile.ts`

**Servicios (6 archivos):**
- ✅ `CloudConnectionService.ts`
- ✅ `MessageService.ts`
- ✅ `TemplateService.ts`
- ✅ `MediaService.ts`
- ✅ `WebhookService.ts`
- ✅ `BusinessProfileService.ts`

**Otros (4 archivos):**
- ✅ `WhatsAppCloudController.ts`
- ✅ `whatsappCloudRoutes.ts`
- ✅ `whatsappCloud.ts` (config)
- ✅ `FASE9_WHATSAPP_CLOUD_API.md`

### 2. Estructura de Base de Datos

**Tablas esperadas (10+ tablas):**
- whatsapp_cloud_connections
- whatsapp_cloud_phone_numbers
- whatsapp_message_templates
- template_components
- template_submissions
- whatsapp_media_library
- media_upload_sessions
- whatsapp_webhook_events
- webhook_subscriptions
- whatsapp_business_profiles
- business_profile_updates

**Funciones SQL esperadas (10+ funciones):**
- create_whatsapp_cloud_connection
- validate_cloud_credentials
- create_message_template
- submit_template_for_review
- upload_media_to_cloud
- get_media_url
- process_webhook_event
- subscribe_to_webhook
- update_business_profile
- get_business_profile

### 3. Modelos Sequelize

Para cada modelo valida:
- ✅ Definición de clase (class WhatsAppCloudConnection)
- ✅ Campos principales (phoneNumberId, accessToken, etc.)
- ✅ Asociaciones (company, phoneNumbers, templates)
- ✅ Decorators (@Table, @Column)
- ✅ Mínimo 80% de campos esperados

### 4. Servicios

Para cada servicio valida:
- ✅ Métodos principales (createConnection, sendMessage, etc.)
- ✅ Líneas de código mínimas (100-150 líneas según servicio)
- ✅ Imports necesarios (axios, logger)
- ✅ Mínimo 75% de métodos implementados

**Métodos esperados por servicio:**

**CloudConnectionService:**
- createConnection
- updateConnection
- testConnection
- getConnectionDetails

**MessageService:**
- sendTextMessage
- sendTemplateMessage
- sendMediaMessage
- markAsRead

**TemplateService:**
- createTemplate
- submitTemplate
- getTemplates
- deleteTemplate

**MediaService:**
- uploadMedia
- getMediaUrl
- deleteMedia
- downloadMedia

**WebhookService:**
- processWebhook
- verifyWebhook
- handleMessageEvent
- handleStatusEvent

**BusinessProfileService:**
- getProfile
- updateProfile
- updateAbout
- updatePhoto

### 5. Controladores y Rutas

**Controlador:**
- ✅ Métodos: createConnection, sendMessage, sendTemplate, uploadMedia, handleWebhook, verifyWebhook, getBusinessProfile

**Rutas (endpoints esperados):**
- ✅ POST /connections
- ✅ GET /connections
- ✅ POST /messages
- ✅ POST /templates
- ✅ POST /media
- ✅ POST /webhooks
- ✅ GET /webhooks
- ✅ Middleware de autenticación (isAuth)

### 6. Configuración y Helpers

**Archivo de configuración (whatsappCloud.ts):**
- ✅ WHATSAPP_CLOUD_API_URL
- ✅ WHATSAPP_CLOUD_API_VERSION
- ✅ PHONE_NUMBER_ID
- ✅ ACCESS_TOKEN
- ✅ WEBHOOK_VERIFY_TOKEN

**Helpers:**

**WhatsAppCloudAPI.ts:**
- sendRequest
- handleResponse
- buildHeaders

**WhatsAppCloudWebhookVerifier.ts:**
- verifySignature
- validateWebhook

### 7. Documentación

**FASE9_WHATSAPP_CLOUD_API.md debe contener:**
- ✅ Sección de Objetivos
- ✅ Arquitectura
- ✅ API Endpoints
- ✅ Webhooks
- ✅ Templates
- ✅ Media
- ✅ Deployment
- ✅ Mínimo 500 líneas de documentación

### 8. Dependencias

**package.json debe incluir:**
- ✅ axios
- ✅ express
- ✅ sequelize
- ✅ sequelize-typescript

**Variables de entorno (.env.example):**
- ✅ WHATSAPP_CLOUD_API_URL
- ✅ WHATSAPP_PHONE_NUMBER_ID
- ✅ WHATSAPP_ACCESS_TOKEN
- ✅ WHATSAPP_WEBHOOK_VERIFY_TOKEN

---

## 📈 Criterios de Éxito

### Tasa de Éxito

- **≥90%:** EXCELENTE - Implementación completa
- **75-89%:** BUENO - Implementación casi completa
- **60-74%:** ACEPTABLE - Necesita mejoras menores
- **<60%:** NECESITA MEJORAS - Implementación incompleta

### Errores Críticos

- **0 errores:** Validación exitosa (exit code 0)
- **>0 errores:** Validación fallida (exit code 1)

### Advertencias

- **<5 advertencias:** Muy bien
- **5-10 advertencias:** Aceptable
- **>10 advertencias:** Revisar calidad del código

---

## 🛠️ Personalización

### Agregar Nuevas Validaciones

Edite `validate-whatsapp-cloud-api.js` y agregue funciones de validación:

```javascript
function validateCustomFeature() {
  log.section('9. Validación de Feature Personalizado');

  // Tu lógica de validación aquí
  const exists = fileExists('path/to/file.ts');
  addResult('Categoría', 'Nombre', exists, 'Mensaje');

  if (exists) {
    log.success('✓ Feature encontrado');
  } else {
    log.error('✗ Feature no encontrado');
  }
}

// Agregar a la función main()
async function main() {
  // ... validaciones existentes
  validateCustomFeature();
  generateReport();
}
```

### Modificar Umbrales

Edite las constantes al inicio del archivo:

```javascript
// Cambiar líneas mínimas de servicios
const services = [
  {
    file: 'src/services/WhatsAppCloudServices/MessageService.ts',
    methods: [...],
    minLines: 200, // Cambiar de 150 a 200
  },
];

// Cambiar umbral de éxito
if (successRate >= 80 && results.failed === 0) { // Cambiar de 75 a 80
  process.exit(0);
}
```

---

## 🐛 Troubleshooting

### Error: "Cannot find module"

**Problema:** Node.js no encuentra el script.

**Solución:**
```bash
# Ejecutar desde la raíz del proyecto
cd "C:\Users\jcromero09\Desktop\CODIGO TEST\0 JR Chateam v0925 ok"
node scripts/validate-whatsapp-cloud-api.js
```

### Error: "ENOENT: no such file or directory"

**Problema:** Archivos esperados no existen.

**Solución:**
- Verifique que los archivos estén en las rutas correctas
- Revise el output del script para ver qué archivos faltan
- Implemente los archivos faltantes

### Muchas Advertencias

**Problema:** El script genera muchas advertencias.

**Solución:**
- Revise archivos con pocas líneas de código
- Asegúrese de que los métodos esperados estén implementados
- Verifique que los decorators de Sequelize estén presentes

### Exit Code 1 pero ≥75% Éxito

**Problema:** Tasa de éxito alta pero validación falla.

**Solución:**
- Revise "Errores Críticos" en el reporte
- Debe tener 0 errores críticos para exit code 0
- Implemente los componentes faltantes

---

## 📝 Ejemplos de Uso

### CI/CD Integration

**GitHub Actions:**

```yaml
name: Validate WhatsApp Cloud API

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Validate Implementation
        run: node scripts/validate-whatsapp-cloud-api.js
```

### Pre-commit Hook

**`.husky/pre-commit`:**

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

echo "Validating WhatsApp Cloud API implementation..."
node scripts/validate-whatsapp-cloud-api.js

if [ $? -eq 0 ]; then
  echo "✓ Validation passed"
else
  echo "✗ Validation failed - commit aborted"
  exit 1
fi
```

### npm Script con Opciones

**`package.json`:**

```json
{
  "scripts": {
    "validate:whatsapp": "node scripts/validate-whatsapp-cloud-api.js",
    "validate:whatsapp:verbose": "node scripts/validate-whatsapp-cloud-api.js --verbose",
    "precommit": "npm run validate:whatsapp"
  }
}
```

---

## 📊 Métricas y Reporting

### Generar Reporte en Archivo

```bash
# Guardar reporte en archivo
node scripts/validate-whatsapp-cloud-api.js > validation-report.txt 2>&1

# Ver reporte
cat validation-report.txt
```

### Integrar con Jest

**`tests/integration/validate-whatsapp.test.js`:**

```javascript
const { exec } = require('child_process');

describe('WhatsApp Cloud API Validation', () => {
  it('should pass validation with ≥75% success rate', (done) => {
    exec('node scripts/validate-whatsapp-cloud-api.js', (error, stdout, stderr) => {
      if (error) {
        console.log(stdout);
        expect(error.code).toBe(0);
      }
      done();
    });
  }, 30000);
});
```

---

## 🔧 Mantenimiento del Script

### Actualizar para Nuevas Fases

Para crear un script de validación para otra fase:

1. Copie el script base:
```bash
cp scripts/validate-whatsapp-cloud-api.js scripts/validate-fase-X.js
```

2. Modifique la configuración:
```javascript
const config = {
  baseDir: process.cwd(),
  requiredFiles: {
    migrations: [
      'database/migrations/fase-X/...sql',
    ],
    // ... otros archivos
  },
};
```

3. Actualice las validaciones específicas de la fase.

### Agregar Tests al Script

```javascript
// Al final del archivo
if (process.env.NODE_ENV === 'test') {
  module.exports = {
    fileExists,
    searchInFile,
    countOccurrences,
    validateRequiredFiles,
    // ... otras funciones
  };
}
```

---

## 📚 Referencias

- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Sequelize TypeScript](https://sequelize.org/docs/v6/other-topics/typescript/)
- [Node.js Exit Codes](https://nodejs.org/api/process.html#process_exit_codes)

---

**Última Actualización:** 6 de octubre de 2025
**Versión del Script:** 1.0.0
**Autor:** JR Chateam Development Team
