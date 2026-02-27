#!/usr/bin/env node

/**
 * Script de Validación - Fase 9: WhatsApp Cloud API Integration
 *
 * Valida la implementación completa de WhatsApp Cloud API v2.0
 * incluyendo mensajería, media, templates, webhooks y más.
 *
 * Uso: node scripts/validate-whatsapp-cloud-api.js
 */

const fs = require('fs');
const path = require('path');

// Colores para console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${colors.bright}═══ ${msg} ═══${colors.reset}\n`),
};

// Configuración de validación
const config = {
  baseDir: process.cwd(),
  requiredFiles: {
    migrations: [
      'database/migrations/whatsapp-cloud/20251006_whatsapp_cloud_base.sql',
      'database/migrations/whatsapp-cloud/20251006_message_templates.sql',
      'database/migrations/whatsapp-cloud/20251006_media_management.sql',
      'database/migrations/whatsapp-cloud/20251006_webhooks_events.sql',
      'database/migrations/whatsapp-cloud/20251006_business_profiles.sql',
    ],
    models: [
      'src/models/WhatsAppCloudConnection.ts',
      'src/models/WhatsAppMessageTemplate.ts',
      'src/models/WhatsAppMedia.ts',
      'src/models/WhatsAppWebhookEvent.ts',
      'src/models/WhatsAppBusinessProfile.ts',
    ],
    services: [
      'src/services/WhatsAppCloudServices/CloudConnectionService.ts',
      'src/services/WhatsAppCloudServices/MessageService.ts',
      'src/services/WhatsAppCloudServices/TemplateService.ts',
      'src/services/WhatsAppCloudServices/MediaService.ts',
      'src/services/WhatsAppCloudServices/WebhookService.ts',
      'src/services/WhatsAppCloudServices/BusinessProfileService.ts',
    ],
    controllers: [
      'src/controllers/WhatsAppCloudController.ts',
    ],
    routes: [
      'src/routes/whatsappCloudRoutes.ts',
    ],
    config: [
      'src/config/whatsappCloud.ts',
    ],
    helpers: [
      'src/helpers/WhatsAppCloudAPI.ts',
      'src/helpers/WhatsAppCloudWebhookVerifier.ts',
    ],
    docs: [
      'docs/FASE9_WHATSAPP_CLOUD_API.md',
    ],
  },
};

// Estructura para resultados
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0,
  details: [],
};

/**
 * Verifica si un archivo existe
 */
function fileExists(filePath) {
  const fullPath = path.join(config.baseDir, filePath);
  return fs.existsSync(fullPath);
}

/**
 * Lee el contenido de un archivo
 */
function readFile(filePath) {
  const fullPath = path.join(config.baseDir, filePath);
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    return null;
  }
}

/**
 * Cuenta líneas de un archivo
 */
function countLines(filePath) {
  const content = readFile(filePath);
  if (!content) return 0;
  return content.split('\n').length;
}

/**
 * Busca un patrón en el contenido de un archivo
 */
function searchInFile(filePath, pattern) {
  const content = readFile(filePath);
  if (!content) return false;

  if (typeof pattern === 'string') {
    return content.includes(pattern);
  } else if (pattern instanceof RegExp) {
    return pattern.test(content);
  }
  return false;
}

/**
 * Cuenta ocurrencias de un patrón en un archivo
 */
function countOccurrences(filePath, pattern) {
  const content = readFile(filePath);
  if (!content) return 0;

  if (typeof pattern === 'string') {
    return (content.match(new RegExp(pattern, 'g')) || []).length;
  } else if (pattern instanceof RegExp) {
    return (content.match(new RegExp(pattern.source, 'g')) || []).length;
  }
  return 0;
}

/**
 * Agrega un resultado de test
 */
function addResult(category, name, passed, message = '') {
  results.total++;
  if (passed) {
    results.passed++;
    results.details.push({ category, name, status: 'passed', message });
  } else {
    results.failed++;
    results.details.push({ category, name, status: 'failed', message });
  }
}

/**
 * Agrega una advertencia
 */
function addWarning(category, name, message) {
  results.warnings++;
  results.details.push({ category, name, status: 'warning', message });
}

/**
 * Valida la existencia de archivos requeridos
 */
function validateRequiredFiles() {
  log.section('1. Validación de Archivos Requeridos');

  Object.keys(config.requiredFiles).forEach((category) => {
    log.info(`Validando ${category}...`);

    const files = config.requiredFiles[category];
    files.forEach((file) => {
      const exists = fileExists(file);
      addResult(
        'Archivos',
        `${category}: ${path.basename(file)}`,
        exists,
        exists ? 'Archivo encontrado' : `Archivo no encontrado: ${file}`
      );

      if (exists) {
        log.success(`  ✓ ${path.basename(file)}`);
      } else {
        log.error(`  ✗ ${path.basename(file)} - No encontrado`);
      }
    });
  });
}

/**
 * Valida las migraciones de base de datos
 */
function validateMigrations() {
  log.section('2. Validación de Migraciones de Base de Datos');

  const migrations = [
    {
      file: 'database/migrations/whatsapp-cloud/20251006_whatsapp_cloud_base.sql',
      tables: ['whatsapp_cloud_connections', 'whatsapp_cloud_phone_numbers'],
      functions: ['create_whatsapp_cloud_connection', 'validate_cloud_credentials'],
    },
    {
      file: 'database/migrations/whatsapp-cloud/20251006_message_templates.sql',
      tables: ['whatsapp_message_templates', 'template_components', 'template_submissions'],
      functions: ['create_message_template', 'submit_template_for_review'],
    },
    {
      file: 'database/migrations/whatsapp-cloud/20251006_media_management.sql',
      tables: ['whatsapp_media_library', 'media_upload_sessions'],
      functions: ['upload_media_to_cloud', 'get_media_url'],
    },
    {
      file: 'database/migrations/whatsapp-cloud/20251006_webhooks_events.sql',
      tables: ['whatsapp_webhook_events', 'webhook_subscriptions'],
      functions: ['process_webhook_event', 'subscribe_to_webhook'],
    },
    {
      file: 'database/migrations/whatsapp-cloud/20251006_business_profiles.sql',
      tables: ['whatsapp_business_profiles', 'business_profile_updates'],
      functions: ['update_business_profile', 'get_business_profile'],
    },
  ];

  migrations.forEach((migration) => {
    log.info(`Validando ${path.basename(migration.file)}...`);

    const exists = fileExists(migration.file);
    if (!exists) {
      addResult('Migraciones', path.basename(migration.file), false, 'Archivo no encontrado');
      log.error(`  ✗ Archivo no encontrado`);
      return;
    }

    // Validar tablas
    migration.tables.forEach((table) => {
      const hasTable = searchInFile(migration.file, `CREATE TABLE IF NOT EXISTS ${table}`);
      addResult(
        'Migraciones',
        `Tabla ${table}`,
        hasTable,
        hasTable ? 'Tabla definida' : `Tabla ${table} no encontrada`
      );

      if (hasTable) {
        log.success(`  ✓ Tabla: ${table}`);
      } else {
        log.error(`  ✗ Tabla no encontrada: ${table}`);
      }
    });

    // Validar funciones
    migration.functions.forEach((func) => {
      const hasFunction = searchInFile(migration.file, `CREATE OR REPLACE FUNCTION ${func}`);
      addResult(
        'Migraciones',
        `Función ${func}`,
        hasFunction,
        hasFunction ? 'Función definida' : `Función ${func} no encontrada`
      );

      if (hasFunction) {
        log.success(`  ✓ Función: ${func}`);
      } else {
        log.error(`  ✗ Función no encontrada: ${func}`);
      }
    });

    // Validar líneas de código (calidad)
    const lines = countLines(migration.file);
    if (lines < 50) {
      addWarning('Migraciones', path.basename(migration.file), `Solo ${lines} líneas - podría estar incompleta`);
      log.warning(`  ⚠ Solo ${lines} líneas - verificar completitud`);
    } else {
      log.info(`  📊 ${lines} líneas de código`);
    }
  });
}

/**
 * Valida los modelos Sequelize
 */
function validateModels() {
  log.section('3. Validación de Modelos Sequelize');

  const models = [
    {
      file: 'src/models/WhatsAppCloudConnection.ts',
      className: 'WhatsAppCloudConnection',
      fields: ['phoneNumberId', 'accessToken', 'businessAccountId', 'webhookVerifyToken'],
      associations: ['company', 'phoneNumbers', 'templates'],
    },
    {
      file: 'src/models/WhatsAppMessageTemplate.ts',
      className: 'WhatsAppMessageTemplate',
      fields: ['name', 'language', 'category', 'status', 'components'],
      associations: ['connection', 'company'],
    },
    {
      file: 'src/models/WhatsAppMedia.ts',
      className: 'WhatsAppMedia',
      fields: ['mediaId', 'mediaType', 'mimeType', 'fileSize', 'url'],
      associations: ['connection', 'uploadedBy'],
    },
    {
      file: 'src/models/WhatsAppWebhookEvent.ts',
      className: 'WhatsAppWebhookEvent',
      fields: ['eventType', 'payload', 'status', 'processedAt'],
      associations: ['connection'],
    },
    {
      file: 'src/models/WhatsAppBusinessProfile.ts',
      className: 'WhatsAppBusinessProfile',
      fields: ['about', 'address', 'description', 'email', 'websites'],
      associations: ['connection'],
    },
  ];

  models.forEach((model) => {
    log.info(`Validando ${model.className}...`);

    const exists = fileExists(model.file);
    if (!exists) {
      addResult('Modelos', model.className, false, 'Archivo no encontrado');
      log.error(`  ✗ Archivo no encontrado`);
      return;
    }

    // Validar clase
    const hasClass = searchInFile(model.file, `class ${model.className}`);
    addResult('Modelos', `${model.className} - Clase`, hasClass, hasClass ? 'Clase definida' : 'Clase no encontrada');

    if (hasClass) {
      log.success(`  ✓ Clase ${model.className}`);
    } else {
      log.error(`  ✗ Clase no definida`);
      return;
    }

    // Validar campos principales
    let fieldsFound = 0;
    model.fields.forEach((field) => {
      if (searchInFile(model.file, field)) {
        fieldsFound++;
      }
    });

    const fieldsRatio = fieldsFound / model.fields.length;
    addResult(
      'Modelos',
      `${model.className} - Campos`,
      fieldsRatio >= 0.8,
      `${fieldsFound}/${model.fields.length} campos encontrados`
    );

    if (fieldsRatio >= 0.8) {
      log.success(`  ✓ Campos: ${fieldsFound}/${model.fields.length}`);
    } else {
      log.warning(`  ⚠ Campos: ${fieldsFound}/${model.fields.length}`);
    }

    // Validar asociaciones
    let associationsFound = 0;
    model.associations.forEach((assoc) => {
      if (searchInFile(model.file, assoc) || searchInFile(model.file, `${assoc}Id`)) {
        associationsFound++;
      }
    });

    if (associationsFound > 0) {
      log.success(`  ✓ Asociaciones: ${associationsFound}/${model.associations.length}`);
    }

    // Validar decorators de Sequelize
    const hasTableDecorator = searchInFile(model.file, '@Table');
    const hasColumnDecorators = countOccurrences(model.file, '@Column') >= 3;

    if (hasTableDecorator && hasColumnDecorators) {
      log.success(`  ✓ Decorators de Sequelize`);
    } else {
      addWarning('Modelos', `${model.className} - Decorators`, 'Decorators de Sequelize podrían estar incompletos');
      log.warning(`  ⚠ Decorators podrían estar incompletos`);
    }
  });
}

/**
 * Valida los servicios
 */
function validateServices() {
  log.section('4. Validación de Servicios');

  const services = [
    {
      file: 'src/services/WhatsAppCloudServices/CloudConnectionService.ts',
      methods: ['createConnection', 'updateConnection', 'testConnection', 'getConnectionDetails'],
      minLines: 100,
    },
    {
      file: 'src/services/WhatsAppCloudServices/MessageService.ts',
      methods: ['sendTextMessage', 'sendTemplateMessage', 'sendMediaMessage', 'markAsRead'],
      minLines: 150,
    },
    {
      file: 'src/services/WhatsAppCloudServices/TemplateService.ts',
      methods: ['createTemplate', 'submitTemplate', 'getTemplates', 'deleteTemplate'],
      minLines: 120,
    },
    {
      file: 'src/services/WhatsAppCloudServices/MediaService.ts',
      methods: ['uploadMedia', 'getMediaUrl', 'deleteMedia', 'downloadMedia'],
      minLines: 100,
    },
    {
      file: 'src/services/WhatsAppCloudServices/WebhookService.ts',
      methods: ['processWebhook', 'verifyWebhook', 'handleMessageEvent', 'handleStatusEvent'],
      minLines: 150,
    },
    {
      file: 'src/services/WhatsAppCloudServices/BusinessProfileService.ts',
      methods: ['getProfile', 'updateProfile', 'updateAbout', 'updatePhoto'],
      minLines: 80,
    },
  ];

  services.forEach((service) => {
    log.info(`Validando ${path.basename(service.file)}...`);

    const exists = fileExists(service.file);
    if (!exists) {
      addResult('Servicios', path.basename(service.file), false, 'Archivo no encontrado');
      log.error(`  ✗ Archivo no encontrado`);
      return;
    }

    // Validar métodos
    let methodsFound = 0;
    service.methods.forEach((method) => {
      const hasMethod = searchInFile(service.file, `${method}`) ||
                       searchInFile(service.file, `async ${method}`) ||
                       searchInFile(service.file, `const ${method}`);
      if (hasMethod) {
        methodsFound++;
      }
    });

    const methodsRatio = methodsFound / service.methods.length;
    addResult(
      'Servicios',
      `${path.basename(service.file)} - Métodos`,
      methodsRatio >= 0.75,
      `${methodsFound}/${service.methods.length} métodos encontrados`
    );

    if (methodsRatio >= 0.75) {
      log.success(`  ✓ Métodos: ${methodsFound}/${service.methods.length}`);
    } else {
      log.error(`  ✗ Métodos: ${methodsFound}/${service.methods.length} - Incompleto`);
    }

    // Validar líneas de código
    const lines = countLines(service.file);
    if (lines >= service.minLines) {
      log.success(`  ✓ ${lines} líneas de código`);
    } else {
      addWarning('Servicios', path.basename(service.file), `Solo ${lines} líneas (esperado: ${service.minLines}+)`);
      log.warning(`  ⚠ Solo ${lines} líneas (esperado: ${service.minLines}+)`);
    }

    // Validar imports necesarios
    const hasAxios = searchInFile(service.file, 'axios') || searchInFile(service.file, 'fetch');
    const hasLogger = searchInFile(service.file, 'logger');

    if (hasAxios) {
      log.success(`  ✓ HTTP client (axios/fetch)`);
    }
    if (hasLogger) {
      log.success(`  ✓ Logger implementado`);
    }
  });
}

/**
 * Valida controladores y rutas
 */
function validateControllersAndRoutes() {
  log.section('5. Validación de Controladores y Rutas');

  // Validar controlador
  const controllerFile = 'src/controllers/WhatsAppCloudController.ts';
  log.info('Validando WhatsAppCloudController...');

  const controllerExists = fileExists(controllerFile);
  addResult('Controladores', 'WhatsAppCloudController', controllerExists,
    controllerExists ? 'Controlador encontrado' : 'Controlador no encontrado');

  if (controllerExists) {
    log.success(`  ✓ Controlador encontrado`);

    // Validar métodos del controlador
    const methods = [
      'createConnection',
      'sendMessage',
      'sendTemplate',
      'uploadMedia',
      'handleWebhook',
      'verifyWebhook',
      'getBusinessProfile',
    ];

    let methodsFound = 0;
    methods.forEach((method) => {
      if (searchInFile(controllerFile, method)) {
        methodsFound++;
      }
    });

    log.info(`  📊 Métodos: ${methodsFound}/${methods.length}`);
  } else {
    log.error(`  ✗ Controlador no encontrado`);
  }

  // Validar rutas
  const routesFile = 'src/routes/whatsappCloudRoutes.ts';
  log.info('Validando whatsappCloudRoutes...');

  const routesExist = fileExists(routesFile);
  addResult('Rutas', 'whatsappCloudRoutes', routesExist,
    routesExist ? 'Archivo de rutas encontrado' : 'Archivo de rutas no encontrado');

  if (routesExist) {
    log.success(`  ✓ Archivo de rutas encontrado`);

    // Validar endpoints
    const endpoints = [
      'POST.*connections',
      'GET.*connections',
      'POST.*messages',
      'POST.*templates',
      'POST.*media',
      'POST.*webhooks',
      'GET.*webhooks',
    ];

    let endpointsFound = 0;
    endpoints.forEach((endpoint) => {
      if (searchInFile(routesFile, new RegExp(endpoint))) {
        endpointsFound++;
      }
    });

    log.info(`  📊 Endpoints: ${endpointsFound}/${endpoints.length}`);

    // Validar middleware
    const hasAuth = searchInFile(routesFile, 'isAuth');
    if (hasAuth) {
      log.success(`  ✓ Middleware de autenticación (isAuth)`);
    } else {
      addWarning('Rutas', 'Middleware', 'Middleware de autenticación no detectado');
      log.warning(`  ⚠ Middleware de autenticación no detectado`);
    }
  } else {
    log.error(`  ✗ Archivo de rutas no encontrado`);
  }
}

/**
 * Valida configuración y helpers
 */
function validateConfigAndHelpers() {
  log.section('6. Validación de Configuración y Helpers');

  // Validar archivo de configuración
  const configFile = 'src/config/whatsappCloud.ts';
  log.info('Validando whatsappCloud.ts...');

  const configExists = fileExists(configFile);
  addResult('Configuración', 'whatsappCloud.ts', configExists,
    configExists ? 'Archivo de configuración encontrado' : 'Archivo de configuración no encontrado');

  if (configExists) {
    log.success(`  ✓ Archivo de configuración encontrado`);

    // Validar configuraciones clave
    const configs = [
      'WHATSAPP_CLOUD_API_URL',
      'WHATSAPP_CLOUD_API_VERSION',
      'PHONE_NUMBER_ID',
      'ACCESS_TOKEN',
      'WEBHOOK_VERIFY_TOKEN',
    ];

    let configsFound = 0;
    configs.forEach((cfg) => {
      if (searchInFile(configFile, cfg)) {
        configsFound++;
      }
    });

    log.info(`  📊 Configuraciones: ${configsFound}/${configs.length}`);
  } else {
    log.error(`  ✗ Archivo de configuración no encontrado`);
  }

  // Validar helpers
  const helpers = [
    {
      file: 'src/helpers/WhatsAppCloudAPI.ts',
      methods: ['sendRequest', 'handleResponse', 'buildHeaders'],
    },
    {
      file: 'src/helpers/WhatsAppCloudWebhookVerifier.ts',
      methods: ['verifySignature', 'validateWebhook'],
    },
  ];

  helpers.forEach((helper) => {
    log.info(`Validando ${path.basename(helper.file)}...`);

    const exists = fileExists(helper.file);
    if (!exists) {
      addResult('Helpers', path.basename(helper.file), false, 'Archivo no encontrado');
      log.error(`  ✗ Archivo no encontrado`);
      return;
    }

    log.success(`  ✓ Archivo encontrado`);

    // Validar métodos
    let methodsFound = 0;
    helper.methods.forEach((method) => {
      if (searchInFile(helper.file, method)) {
        methodsFound++;
      }
    });

    log.info(`  📊 Métodos: ${methodsFound}/${helper.methods.length}`);
  });
}

/**
 * Valida documentación
 */
function validateDocumentation() {
  log.section('7. Validación de Documentación');

  const docsFile = 'docs/FASE9_WHATSAPP_CLOUD_API.md';
  log.info('Validando FASE9_WHATSAPP_CLOUD_API.md...');

  const docsExist = fileExists(docsFile);
  addResult('Documentación', 'FASE9_WHATSAPP_CLOUD_API.md', docsExist,
    docsExist ? 'Documentación encontrada' : 'Documentación no encontrada');

  if (docsExist) {
    log.success(`  ✓ Archivo de documentación encontrado`);

    const lines = countLines(docsFile);
    log.info(`  📊 ${lines} líneas de documentación`);

    if (lines < 500) {
      addWarning('Documentación', 'Completitud', `Solo ${lines} líneas - podría estar incompleta`);
      log.warning(`  ⚠ Solo ${lines} líneas - verificar completitud`);
    } else {
      log.success(`  ✓ Documentación completa (${lines} líneas)`);
    }

    // Validar secciones clave
    const sections = [
      'Objetivos',
      'Arquitectura',
      'API Endpoints',
      'Webhooks',
      'Templates',
      'Media',
      'Deployment',
    ];

    let sectionsFound = 0;
    sections.forEach((section) => {
      if (searchInFile(docsFile, section)) {
        sectionsFound++;
      }
    });

    log.info(`  📊 Secciones: ${sectionsFound}/${sections.length}`);

    if (sectionsFound >= sections.length * 0.8) {
      log.success(`  ✓ Secciones principales presentes`);
    } else {
      addWarning('Documentación', 'Secciones', `Solo ${sectionsFound}/${sections.length} secciones encontradas`);
      log.warning(`  ⚠ Secciones incompletas`);
    }
  } else {
    log.error(`  ✗ Documentación no encontrada`);
  }
}

/**
 * Valida integraciones y dependencias
 */
function validateIntegrations() {
  log.section('8. Validación de Integraciones y Dependencias');

  // Validar package.json
  const packageFile = 'package.json';
  log.info('Validando dependencias en package.json...');

  const packageExists = fileExists(packageFile);
  if (packageExists) {
    const dependencies = [
      'axios',
      'express',
      'sequelize',
      'sequelize-typescript',
    ];

    let depsFound = 0;
    dependencies.forEach((dep) => {
      if (searchInFile(packageFile, dep)) {
        depsFound++;
      }
    });

    addResult('Dependencias', 'package.json', depsFound === dependencies.length,
      `${depsFound}/${dependencies.length} dependencias encontradas`);

    if (depsFound === dependencies.length) {
      log.success(`  ✓ Todas las dependencias necesarias presentes`);
    } else {
      log.warning(`  ⚠ ${depsFound}/${dependencies.length} dependencias encontradas`);
    }
  }

  // Validar variables de entorno
  const envExampleFile = '.env.example';
  log.info('Validando variables de entorno...');

  const envExampleExists = fileExists(envExampleFile);
  if (envExampleExists) {
    const envVars = [
      'WHATSAPP_CLOUD_API_URL',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_ACCESS_TOKEN',
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    ];

    let envVarsFound = 0;
    envVars.forEach((envVar) => {
      if (searchInFile(envExampleFile, envVar)) {
        envVarsFound++;
      }
    });

    if (envVarsFound > 0) {
      log.success(`  ✓ ${envVarsFound}/${envVars.length} variables de entorno documentadas`);
    } else {
      addWarning('Configuración', 'Variables de Entorno', 'Variables de entorno no documentadas en .env.example');
      log.warning(`  ⚠ Variables de entorno no documentadas`);
    }
  }
}

/**
 * Genera reporte final
 */
function generateReport() {
  log.section('📊 REPORTE FINAL DE VALIDACIÓN');

  const successRate = ((results.passed / results.total) * 100).toFixed(1);
  const status = successRate >= 90 ? 'EXCELENTE' :
                 successRate >= 75 ? 'BUENO' :
                 successRate >= 60 ? 'ACEPTABLE' : 'NECESITA MEJORAS';

  console.log(`${colors.bright}Total de Pruebas:${colors.reset} ${results.total}`);
  console.log(`${colors.green}Exitosas:${colors.reset} ${results.passed}`);
  console.log(`${colors.red}Fallidas:${colors.reset} ${results.failed}`);
  console.log(`${colors.yellow}Advertencias:${colors.reset} ${results.warnings}`);
  console.log(`${colors.cyan}Tasa de Éxito:${colors.reset} ${successRate}%`);
  console.log(`${colors.bright}Estado:${colors.reset} ${status}\n`);

  // Detalles por categoría
  const categories = {};
  results.details.forEach((detail) => {
    if (!categories[detail.category]) {
      categories[detail.category] = { passed: 0, failed: 0, warnings: 0 };
    }
    if (detail.status === 'passed') categories[detail.category].passed++;
    else if (detail.status === 'failed') categories[detail.category].failed++;
    else if (detail.status === 'warning') categories[detail.category].warnings++;
  });

  console.log(`${colors.bright}Resultados por Categoría:${colors.reset}\n`);
  Object.keys(categories).forEach((category) => {
    const cat = categories[category];
    const total = cat.passed + cat.failed;
    const rate = total > 0 ? ((cat.passed / total) * 100).toFixed(0) : 0;
    const statusIcon = rate >= 80 ? '✓' : rate >= 60 ? '⚠' : '✗';
    const statusColor = rate >= 80 ? colors.green : rate >= 60 ? colors.yellow : colors.red;

    console.log(`${statusColor}${statusIcon}${colors.reset} ${category}: ${cat.passed}/${total} (${rate}%) | Advertencias: ${cat.warnings}`);
  });

  // Errores críticos
  const criticalErrors = results.details.filter(d => d.status === 'failed');
  if (criticalErrors.length > 0) {
    console.log(`\n${colors.red}${colors.bright}Errores Críticos:${colors.reset}\n`);
    criticalErrors.slice(0, 10).forEach((error) => {
      console.log(`${colors.red}✗${colors.reset} ${error.category} - ${error.name}`);
      if (error.message) {
        console.log(`  ${colors.dim}${error.message}${colors.reset}`);
      }
    });

    if (criticalErrors.length > 10) {
      console.log(`\n  ${colors.dim}... y ${criticalErrors.length - 10} errores más${colors.reset}`);
    }
  }

  // Recomendaciones
  console.log(`\n${colors.bright}Recomendaciones:${colors.reset}\n`);

  if (results.failed > 0) {
    console.log(`${colors.yellow}•${colors.reset} Revise los ${results.failed} errores críticos antes de continuar`);
  }

  if (results.warnings > 10) {
    console.log(`${colors.yellow}•${colors.reset} Hay ${results.warnings} advertencias - considere revisarlas`);
  }

  if (successRate >= 90) {
    console.log(`${colors.green}•${colors.reset} ¡Excelente! La implementación está completa`);
  } else if (successRate >= 75) {
    console.log(`${colors.yellow}•${colors.reset} La implementación está casi completa - revise los elementos faltantes`);
  } else {
    console.log(`${colors.red}•${colors.reset} La implementación necesita mejoras significativas`);
  }

  // Exit code
  console.log('');
  if (successRate >= 75 && results.failed === 0) {
    log.success('Validación completada exitosamente ✓');
    process.exit(0);
  } else {
    log.error('Validación completada con errores ✗');
    process.exit(1);
  }
}

/**
 * Función principal
 */
async function main() {
  console.log(`${colors.cyan}${colors.bright}`);
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║  VALIDACIÓN FASE 9: WHATSAPP CLOUD API INTEGRATION            ║');
  console.log('║  JR Chateam v6.0.0                                            ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);

  try {
    validateRequiredFiles();
    validateMigrations();
    validateModels();
    validateServices();
    validateControllersAndRoutes();
    validateConfigAndHelpers();
    validateDocumentation();
    validateIntegrations();

    generateReport();
  } catch (error) {
    log.error(`Error durante la validación: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar script
main();
