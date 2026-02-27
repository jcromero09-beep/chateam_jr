import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const basePath = path.join(__dirname, '..');

function fileExists(filepath) {
  try {
    return fs.existsSync(filepath);
  } catch (err) {
    return false;
  }
}

function checkFile(filepath, description) {
  const exists = fileExists(filepath);
  return { exists, path: filepath, description };
}

console.log(`\n${colors.blue}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.blue}║   VALIDACIÓN DE INFRAESTRUCTURA - JR CHATEAM v0925        ║${colors.reset}`);
console.log(`${colors.blue}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`);

const validations = {
  '26-Autenticación': [
    checkFile(path.join(basePath, 'controllers', 'SessionController.ts'), 'SessionController'),
    checkFile(path.join(basePath, 'routes', 'authRoutes.ts'), 'Auth Routes'),
    checkFile(path.join(basePath, 'pages', 'Login'), 'Login Page'),
    checkFile(path.join(basePath, 'pages', 'Signup'), 'Signup Page'),
    checkFile(path.join(basePath, 'pages', 'ForgetPassWord'), 'Forget Password Page')
  ],
  '27-Sistema de Permisos': [
    checkFile(path.join(basePath, 'middleware', 'isAuth.ts'), 'isAuth Middleware'),
    checkFile(path.join(basePath, 'components'), 'Components directory')
  ],
  '28-WebSockets': [
    checkFile(path.join(basePath, 'libs'), 'Libs directory (for socket.io)')
  ],
  '29-Migraciones y Seeders': [
    checkFile(path.join(basePath, 'database', 'migrations'), 'Migrations directory'),
    checkFile(path.join(basePath, 'database', 'seeds'), 'Seeds directory'),
    checkFile(path.join(basePath, 'models'), 'Models directory')
  ],
  '30-Servidor y Deployment': [
    checkFile(path.join(basePath, 'server.ts'), 'Main Server'),
    checkFile(path.join(basePath, 'server-cluster.ts'), 'Cluster Server'),
    checkFile(path.join(basePath, 'app.ts'), 'App Configuration'),
    checkFile(path.join(basePath, '.env.example'), 'Environment Example'),
    checkFile(path.join(basePath, 'package.json'), 'Package.json')
  ],
  '31-Docker': [
    checkFile(path.join(basePath, 'Dockerfile'), 'Dockerfile'),
    checkFile(path.join(basePath, 'Dockerfile.worker'), 'Worker Dockerfile'),
    checkFile(path.join(basePath, 'docker-compose.yml'), 'Docker Compose'),
    checkFile(path.join(basePath, 'docker-compose.production.yml'), 'Docker Compose Production'),
    checkFile(path.join(basePath, 'docker-compose.staging.yml'), 'Docker Compose Staging'),
    checkFile(path.join(basePath, 'nginx'), 'Nginx directory')
  ],
  '32-Monitoreo': [
    checkFile(path.join(basePath, 'monitoring'), 'Monitoring directory'),
    checkFile(path.join(basePath, 'prometheus'), 'Prometheus directory')
  ],
  '33-Interfaz de Usuario': [
    checkFile(path.join(basePath, 'components'), 'Components'),
    checkFile(path.join(basePath, 'pages'), 'Pages'),
    checkFile(path.join(basePath, 'styles'), 'Styles'),
    checkFile(path.join(basePath, 'layout'), 'Layout'),
    checkFile(path.join(basePath, 'context'), 'Context (State Management)')
  ],
  '34-Rendimiento': [
    checkFile(path.join(basePath, 'assets'), 'Assets directory'),
    checkFile(path.join(basePath, 'workers'), 'Workers directory'),
    checkFile(path.join(basePath, 'jobs'), 'Jobs directory')
  ],
  '35-Pruebas Funcionales': [
    checkFile(path.join(basePath, 'tests'), 'Tests directory'),
    checkFile(path.join(basePath, 'jest.config.js'), 'Jest Config'),
    checkFile(path.join(basePath, 'playwright.config.ts'), 'Playwright Config')
  ],
  '36-Seguridad': [
    checkFile(path.join(basePath, 'middleware'), 'Middleware directory'),
    checkFile(path.join(basePath, 'errors'), 'Error handling'),
    checkFile(path.join(basePath, 'helpers'), 'Helpers directory')
  ]
};

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

const results = {};

for (const [module, checks] of Object.entries(validations)) {
  const moduleResults = {
    total: checks.length,
    passed: 0,
    failed: 0,
    details: []
  };

  console.log(`\n${colors.blue}Módulo ${module}:${colors.reset}`);

  checks.forEach(check => {
    totalChecks++;
    if (check.exists) {
      passedChecks++;
      moduleResults.passed++;
      console.log(`  ${colors.green}✓${colors.reset} ${check.description}`);
    } else {
      failedChecks++;
      moduleResults.failed++;
      console.log(`  ${colors.red}✗${colors.reset} ${check.description} ${colors.yellow}(FALTANTE)${colors.reset}`);
    }

    moduleResults.details.push({
      description: check.description,
      path: check.path,
      exists: check.exists
    });
  });

  const moduleStatus = moduleResults.failed === 0 ? 'PASSED' : 'PARTIAL';
  const statusColor = moduleResults.failed === 0 ? colors.green : colors.yellow;
  console.log(`  ${statusColor}Status: ${moduleStatus} (${moduleResults.passed}/${moduleResults.total})${colors.reset}`);

  results[module] = moduleResults;
}

console.log(`\n${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}`);
console.log(`${colors.blue}RESUMEN FINAL:${colors.reset}`);
console.log(`${colors.green}Verificaciones Exitosas: ${passedChecks}${colors.reset}`);
console.log(`${colors.red}Verificaciones Fallidas: ${failedChecks}${colors.reset}`);
console.log(`Total de Verificaciones: ${totalChecks}`);
console.log(`Tasa de Éxito: ${((passedChecks / totalChecks) * 100).toFixed(2)}%`);
console.log(`${colors.blue}═══════════════════════════════════════════════════════════${colors.reset}\n`);

// Guardar resultados
const reportPath = path.join(basePath, 'INFRASTRUCTURE_VALIDATION_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    totalChecks,
    passed: passedChecks,
    failed: failedChecks,
    successRate: ((passedChecks / totalChecks) * 100).toFixed(2) + '%'
  },
  modules: results
}, null, 2));

console.log(`${colors.green}✓${colors.reset} Reporte guardado en: INFRASTRUCTURE_VALIDATION_REPORT.json\n`);

process.exit(failedChecks > 0 ? 1 : 0);
