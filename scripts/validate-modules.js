import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colores para consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const basePath = path.join(__dirname, '..');

// Definición de módulos a validar
const modules = [
  {
    id: 1,
    name: 'Dashboard y Reportes',
    controllers: ['DashbardController.ts', 'StatisticsController.ts'],
    routes: ['dashboardRoutes.ts', 'statisticsRoutes.ts'],
    pages: ['Dashboard', 'Reports', 'Moments']
  },
  {
    id: 2,
    name: 'Tickets / WhatsApp',
    controllers: ['TicketController.ts', 'MessageController.ts'],
    routes: ['ticketRoutes.ts', 'messageRoutes.ts'],
    pages: ['Tickets']
  },
  {
    id: 3,
    name: 'Contactos',
    controllers: ['ContactController.ts'],
    routes: ['contactRoutes.ts'],
    pages: ['Contacts']
  },
  {
    id: 4,
    name: 'Campañas de Marketing',
    controllers: ['CampaignController.ts', 'CampaignSettingController.ts', 'ContactListController.ts'],
    routes: ['campaignRoutes.ts', 'campaignSettingRoutes.ts', 'contactListRoutes.ts'],
    pages: ['Campaigns', 'ContactLists', 'CampaignsConfig']
  },
  {
    id: 5,
    name: 'FlowBuilder',
    controllers: ['FlowBuilderController.ts', 'FlowCampaignController.ts', 'FlowDefaultController.ts'],
    routes: ['flowBuilderRoutes.ts', 'flowCampaignRoutes.ts', 'flowDefaultRoutes.ts'],
    pages: ['FlowBuilder', 'FlowBuilderConfig', 'CampaignsPhrase']
  },
  {
    id: 6,
    name: 'Quick Messages',
    controllers: ['QuickMessageController.ts'],
    routes: ['quickMessageRoutes.ts'],
    pages: ['QuickMessages']
  },
  {
    id: 7,
    name: 'Kanban / Funnel de Ventas',
    controllers: [],
    routes: [],
    pages: ['Kanban', 'TagsKanban']
  },
  {
    id: 8,
    name: 'Programación / Schedules',
    controllers: ['ScheduleController.ts', 'ScheduledMessagesController.ts'],
    routes: ['scheduleRoutes.ts', 'ScheduledMessagesRoutes.ts'],
    pages: ['Schedules']
  },
  {
    id: 9,
    name: 'Tags',
    controllers: ['TagController.ts', 'TicketTagController.ts'],
    routes: ['tagRoutes.ts', 'ticketTagRoutes.ts'],
    pages: ['Tags']
  },
  {
    id: 10,
    name: 'Chat Interno',
    controllers: ['ChatController.ts'],
    routes: ['chatRoutes.ts'],
    pages: ['Chat']
  },
  {
    id: 11,
    name: 'Ayuda / Helps',
    controllers: ['HelpController.ts'],
    routes: ['helpRoutes.ts'],
    pages: ['Helps']
  },
  {
    id: 12,
    name: 'Usuarios',
    controllers: ['UserController.ts'],
    routes: ['userRoutes.ts'],
    pages: ['Users']
  },
  {
    id: 13,
    name: 'Colas / Queues',
    controllers: ['QueueController.ts', 'QueueOptionController.ts'],
    routes: ['queueRoutes.ts', 'queueOptionRoutes.ts'],
    pages: ['Queues']
  },
  {
    id: 14,
    name: 'Prompts OpenAI',
    controllers: ['PromptController.ts'],
    routes: ['promptRouter.ts'],
    pages: ['Prompts']
  },
  {
    id: 15,
    name: 'Integraciones',
    controllers: ['QueueIntegrationController.ts'],
    routes: ['queueIntegrationRoutes.ts'],
    pages: ['QueueIntegration']
  },
  {
    id: 16,
    name: 'Conexiones WhatsApp/Telegram',
    controllers: ['WhatsAppController.ts', 'WhatsAppSessionController.ts', 'TelegramController.ts'],
    routes: ['whatsappRoutes.ts', 'whatsappSessionRoutes.ts', 'telegramRoutes.ts'],
    pages: ['Connections']
  },
  {
    id: 17,
    name: 'All Connections - Super Admin',
    controllers: [],
    routes: [],
    pages: ['AllConnections']
  },
  {
    id: 18,
    name: 'Recibos - Super Admin',
    controllers: ['ReceiptController.ts'],
    routes: ['recepts.ts'],
    pages: ['Recipts']
  },
  {
    id: 19,
    name: 'Archivos',
    controllers: ['FilesController.ts', 'MediaController.ts'],
    routes: ['filesRoutes.ts', 'mediaRoutes.ts'],
    pages: ['Files']
  },
  {
    id: 20,
    name: 'Financiero',
    controllers: ['BillingController.ts', 'SubscriptionController.ts', 'InvoicesController.ts'],
    routes: ['billingRoutes.ts', 'subScriptionRoutes.ts', 'invoicesRoutes.ts'],
    pages: ['Financeiro', 'Subscription']
  },
  {
    id: 21,
    name: 'Configuraciones',
    controllers: ['SettingController.ts', 'CompanySettingsController.ts'],
    routes: ['settingRoutes.ts', 'companySettingsRoutes.ts'],
    pages: ['Settings', 'SettingsCustom']
  },
  {
    id: 22,
    name: 'Términos y Condiciones',
    controllers: [],
    routes: [],
    pages: ['TermsManagement']
  },
  {
    id: 23,
    name: 'Empresas - Super Admin',
    controllers: ['CompanyController.ts'],
    routes: ['companyRoutes.ts'],
    pages: ['Companies']
  },
  {
    id: 24,
    name: 'Anuncios - Super Admin',
    controllers: ['AnnouncementController.ts'],
    routes: ['announcementRoutes.ts'],
    pages: ['Annoucements']
  },
  {
    id: 25,
    name: 'Messages API',
    controllers: ['ApiController.ts'],
    routes: ['apiRoutes.ts'],
    pages: ['MessagesAPI']
  }
];

// Función para verificar si un archivo existe
function fileExists(filepath) {
  try {
    return fs.existsSync(filepath);
  } catch (err) {
    return false;
  }
}

// Función para validar un módulo
function validateModule(module) {
  const results = {
    module: module.name,
    id: module.id,
    controllersFound: [],
    controllersMissing: [],
    routesFound: [],
    routesMissing: [],
    pagesFound: [],
    pagesMissing: [],
    status: 'PASSED'
  };

  // Validar controladores
  module.controllers.forEach(controller => {
    const filepath = path.join(basePath, 'controllers', controller);
    if (fileExists(filepath)) {
      results.controllersFound.push(controller);
    } else {
      results.controllersMissing.push(controller);
      results.status = 'FAILED';
    }
  });

  // Validar rutas
  module.routes.forEach(route => {
    const filepath = path.join(basePath, 'routes', route);
    if (fileExists(filepath)) {
      results.routesFound.push(route);
    } else {
      results.routesMissing.push(route);
      results.status = 'FAILED';
    }
  });

  // Validar páginas
  module.pages.forEach(page => {
    const filepath = path.join(basePath, 'pages', page);
    if (fileExists(filepath)) {
      results.pagesFound.push(page);
    } else {
      results.pagesMissing.push(page);
      results.status = 'FAILED';
    }
  });

  return results;
}

// Ejecutar validación
console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.blue}║   VALIDACIÓN DE MÓDULOS - JR CHATEAM v0925               ║${colors.reset}`);
console.log(`${colors.blue}╚═══════════════════════════════════════════════════════════╝${colors.reset}\n`);

const allResults = [];
let passedCount = 0;
let failedCount = 0;

modules.forEach(module => {
  const result = validateModule(module);
  allResults.push(result);

  if (result.status === 'PASSED') {
    passedCount++;
    console.log(`${colors.green}✓${colors.reset} Módulo ${result.id}: ${result.module} - ${colors.green}PASSED${colors.reset}`);
  } else {
    failedCount++;
    console.log(`${colors.red}✗${colors.reset} Módulo ${result.id}: ${result.module} - ${colors.red}FAILED${colors.reset}`);

    if (result.controllersMissing.length > 0) {
      console.log(`  ${colors.yellow}  Controladores faltantes: ${result.controllersMissing.join(', ')}${colors.reset}`);
    }
    if (result.routesMissing.length > 0) {
      console.log(`  ${colors.yellow}  Rutas faltantes: ${result.routesMissing.join(', ')}${colors.reset}`);
    }
    if (result.pagesMissing.length > 0) {
      console.log(`  ${colors.yellow}  Páginas faltantes: ${result.pagesMissing.join(', ')}${colors.reset}`);
    }
  }
});

// Resumen
console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}RESUMEN DE VALIDACIÓN:${colors.reset}`);
console.log(`${colors.green}Módulos Aprobados: ${passedCount}${colors.reset}`);
console.log(`${colors.red}Módulos con Fallos: ${failedCount}${colors.reset}`);
console.log(`Total de Módulos: ${modules.length}`);
console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}\n`);

// Guardar resultados en JSON
const reportPath = path.join(basePath, 'MODULE_VALIDATION_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    total: modules.length,
    passed: passedCount,
    failed: failedCount,
    successRate: ((passedCount / modules.length) * 100).toFixed(2) + '%'
  },
  modules: allResults
}, null, 2));

console.log(`${colors.green}✓${colors.reset} Reporte guardado en: MODULE_VALIDATION_REPORT.json\n`);

// Exit code
process.exit(failedCount > 0 ? 1 : 0);
