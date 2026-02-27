/**
 * Script de validación de Pasos 5 y 6
 * Verifica que la configuración del frontend y la integración backend-frontend estén completas
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

console.log('🔍 VALIDACIÓN DE PASOS 5 Y 6');
console.log('='.repeat(60));
console.log('');

let allPassed = true;

// ============================================================
// PASO 5: CONFIGURACIÓN FRONTEND
// ============================================================

console.log('📦 PASO 5: CONFIGURACIÓN FRONTEND');
console.log('-'.repeat(60));

// 5.1 - Verificar proyecto frontend creado
console.log('\n✅ 5.1 - Proyecto Frontend Creado');
const frontendFiles = [
  'frontend/package.json',
  'frontend/vite.config.ts',
  'frontend/tsconfig.json',
  'frontend/src/main.tsx',
  'frontend/src/App.tsx',
  'frontend/src/theme.ts',
  'frontend/src/pages/Login.tsx',
  'frontend/src/pages/Dashboard.tsx',
  'frontend/src/components/Navbar.tsx',
  'frontend/src/components/Sidebar.tsx',
];

frontendFiles.forEach(file => {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NO ENCONTRADO`);
    allPassed = false;
  }
});

// 5.2 - Verificar variables de entorno
console.log('\n✅ 5.2 - Variables de Entorno');
const envLocalPath = path.join(rootDir, 'frontend/.env.local');
if (fs.existsSync(envLocalPath)) {
  console.log('   ✅ frontend/.env.local existe');
  const envContent = fs.readFileSync(envLocalPath, 'utf-8');

  const requiredVars = [
    'VITE_API_URL',
    'VITE_WS_URL',
    'VITE_APP_NAME',
    'VITE_APP_VERSION',
  ];

  requiredVars.forEach(varName => {
    if (envContent.includes(varName)) {
      console.log(`   ✅ ${varName} definida`);
    } else {
      console.log(`   ❌ ${varName} - NO DEFINIDA`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ frontend/.env.local - NO ENCONTRADO');
  allPassed = false;
}

// Verificar .env del backend
const backendEnvPath = path.join(rootDir, '.env');
if (fs.existsSync(backendEnvPath)) {
  console.log('   ✅ .env (backend) existe');
  const envContent = fs.readFileSync(backendEnvPath, 'utf-8');

  const requiredBackendVars = [
    'FRONTEND_URL',
    'BACKEND_URL',
    'PORT',
    'JWT_SECRET',
  ];

  requiredBackendVars.forEach(varName => {
    if (envContent.includes(varName)) {
      const match = envContent.match(new RegExp(`${varName}=(.+)`));
      if (match && match[1].trim()) {
        console.log(`   ✅ ${varName}=${match[1].trim()}`);
      } else {
        console.log(`   ⚠️  ${varName} definida pero vacía`);
      }
    } else {
      console.log(`   ❌ ${varName} - NO DEFINIDA`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ .env (backend) - NO ENCONTRADO');
  allPassed = false;
}

// 5.3 - Verificar configuración Vite
console.log('\n✅ 5.3 - Configuración Vite');
const viteConfigPath = path.join(rootDir, 'frontend/vite.config.ts');
if (fs.existsSync(viteConfigPath)) {
  console.log('   ✅ vite.config.ts existe');
  const viteConfig = fs.readFileSync(viteConfigPath, 'utf-8');

  const viteRequirements = [
    { pattern: /server:\s*{/, name: 'Server config' },
    { pattern: /port:\s*3000/, name: 'Puerto 3000' },
    { pattern: /proxy:\s*{/, name: 'Proxy configurado' },
    { pattern: /['"]\/api['"]:/, name: 'Proxy /api' },
    { pattern: /['"]\/socket\.io['"]:/, name: 'Proxy /socket.io' },
    { pattern: /target:\s*['"]http:\/\/localhost:3001['"]/, name: 'Target backend:3001' },
  ];

  viteRequirements.forEach(({ pattern, name }) => {
    if (pattern.test(viteConfig)) {
      console.log(`   ✅ ${name}`);
    } else {
      console.log(`   ❌ ${name} - NO ENCONTRADO`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ vite.config.ts - NO ENCONTRADO');
  allPassed = false;
}

// 5.4 - Verificar dependencias instaladas
console.log('\n✅ 5.4 - Dependencias Instaladas');
const nodeModulesPath = path.join(rootDir, 'frontend/node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('   ✅ node_modules existe');

  const criticalDeps = [
    'react',
    'react-dom',
    'react-router-dom',
    'vite',
    '@mui/joy',
    'axios',
    'react-toastify',
  ];

  criticalDeps.forEach(dep => {
    const depPath = path.join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
      console.log(`   ✅ ${dep}`);
    } else {
      console.log(`   ❌ ${dep} - NO INSTALADO`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ node_modules - NO ENCONTRADO');
  console.log('   💡 Ejecutar: cd frontend && npm install');
  allPassed = false;
}

// ============================================================
// PASO 6: INTEGRACIÓN BACKEND-FRONTEND
// ============================================================

console.log('\n\n📡 PASO 6: INTEGRACIÓN BACKEND-FRONTEND');
console.log('-'.repeat(60));

// 6.1 - Verificar CORS en backend
console.log('\n✅ 6.1 - Configuración CORS');
const appTsPath = path.join(rootDir, 'app.ts');
if (fs.existsSync(appTsPath)) {
  console.log('   ✅ app.ts existe');
  const appTs = fs.readFileSync(appTsPath, 'utf-8');

  const corsRequirements = [
    { pattern: /import.*cors.*from ['"]cors['"]/, name: 'Import CORS' },
    { pattern: /app\.use\(cors\(/, name: 'CORS middleware usado' },
    { pattern: /credentials:\s*true/, name: 'Credentials habilitados' },
    { pattern: /origin:/, name: 'Origin configurado' },
  ];

  corsRequirements.forEach(({ pattern, name }) => {
    if (pattern.test(appTs)) {
      console.log(`   ✅ ${name}`);
    } else {
      console.log(`   ❌ ${name} - NO ENCONTRADO`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ app.ts - NO ENCONTRADO');
  allPassed = false;
}

// 6.2 - Verificar servicios API en frontend
console.log('\n✅ 6.2 - Servicios API Frontend');
const apiServices = [
  'frontend/src/services/api.ts',
  'frontend/src/services/authService.ts',
  'frontend/src/services/ticketService.ts',
];

apiServices.forEach(file => {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NO ENCONTRADO`);
    allPassed = false;
  }
});

// 6.3 - Verificar interceptores Axios
console.log('\n✅ 6.3 - Interceptores Axios');
const apiTsPath = path.join(rootDir, 'frontend/src/services/api.ts');
if (fs.existsSync(apiTsPath)) {
  const apiTs = fs.readFileSync(apiTsPath, 'utf-8');

  const interceptorRequirements = [
    { pattern: /api\.interceptors\.request\.use/, name: 'Request interceptor' },
    { pattern: /api\.interceptors\.response\.use/, name: 'Response interceptor' },
    { pattern: /Authorization.*Bearer/, name: 'Auto-inyección de token' },
    { pattern: /refreshToken/, name: 'Refresh token logic' },
    { pattern: /toast\.(error|success|info|warn)/, name: 'Toast notifications' },
  ];

  interceptorRequirements.forEach(({ pattern, name }) => {
    if (pattern.test(apiTs)) {
      console.log(`   ✅ ${name}`);
    } else {
      console.log(`   ❌ ${name} - NO ENCONTRADO`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ api.ts - NO ENCONTRADO');
  allPassed = false;
}

// 6.4 - Verificar hook useAuth
console.log('\n✅ 6.4 - Hook useAuth');
const useAuthPath = path.join(rootDir, 'frontend/src/hooks/useAuth.ts');
if (fs.existsSync(useAuthPath)) {
  console.log('   ✅ useAuth.ts existe');
  const useAuthTs = fs.readFileSync(useAuthPath, 'utf-8');

  const hookRequirements = [
    { pattern: /import.*authService/, name: 'Import authService' },
    { pattern: /login\s*=/, name: 'Login function' },
    { pattern: /logout\s*=/, name: 'Logout function' },
    { pattern: /isAuthenticated/, name: 'isAuthenticated state' },
    { pattern: /user/, name: 'user state' },
  ];

  hookRequirements.forEach(({ pattern, name }) => {
    if (pattern.test(useAuthTs)) {
      console.log(`   ✅ ${name}`);
    } else {
      console.log(`   ❌ ${name} - NO ENCONTRADO`);
      allPassed = false;
    }
  });
} else {
  console.log('   ❌ useAuth.ts - NO ENCONTRADO');
  allPassed = false;
}

// 6.5 - Verificar script de pruebas de integración
console.log('\n✅ 6.5 - Script de Pruebas de Integración');
const testIntegrationPath = path.join(rootDir, 'scripts/test-integration.js');
if (fs.existsSync(testIntegrationPath)) {
  console.log('   ✅ test-integration.js existe');
} else {
  console.log('   ❌ test-integration.js - NO ENCONTRADO');
  allPassed = false;
}

// 6.6 - Verificar documentación
console.log('\n✅ 6.6 - Documentación');
const docs = [
  'docs/BACKEND_FRONTEND_INTEGRATION.md',
  'INTEGRATION_COMPLETE_REPORT.md',
];

docs.forEach(file => {
  const fullPath = path.join(rootDir, file);
  if (fs.existsSync(fullPath)) {
    console.log(`   ✅ ${file}`);
  } else {
    console.log(`   ❌ ${file} - NO ENCONTRADO`);
    allPassed = false;
  }
});

// ============================================================
// RESUMEN FINAL
// ============================================================

console.log('\n\n' + '='.repeat(60));
console.log('📊 RESUMEN DE VALIDACIÓN');
console.log('='.repeat(60));

if (allPassed) {
  console.log('\n✅ ¡VALIDACIÓN EXITOSA!');
  console.log('✅ Paso 5 (Configuración Frontend): COMPLETO');
  console.log('✅ Paso 6 (Integración Backend-Frontend): COMPLETO');
  console.log('\n📝 Próximo paso: Proceder al Paso 10 (Deployment)');
  console.log('   1. Build de producción (backend + frontend)');
  console.log('   2. Configurar PM2 para producción');
  console.log('   3. Probar flujo completo de login');
  process.exit(0);
} else {
  console.log('\n⚠️  VALIDACIÓN INCOMPLETA');
  console.log('❌ Algunos componentes faltan o tienen errores');
  console.log('\n🔧 Recomendaciones:');
  console.log('   1. Revisar los items marcados con ❌');
  console.log('   2. Completar configuraciones faltantes');
  console.log('   3. Volver a ejecutar esta validación');
  process.exit(1);
}
