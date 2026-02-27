/**
 * Script de prueba de integración Backend-Frontend
 * Verifica la comunicación entre frontend y backend
 */

import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

console.log('🔗 TEST DE INTEGRACIÓN BACKEND-FRONTEND');
console.log('='.repeat(60));
console.log(`Backend URL: ${BACKEND_URL}`);
console.log(`Frontend URL: ${FRONTEND_URL}`);
console.log('');

// Configurar timeout
const api = axios.create({
  timeout: 5000,
  validateStatus: () => true, // No throw en errores
});

async function testBackendHealth() {
  console.log('1️⃣  Probando health check del backend...');
  try {
    const response = await api.get(`${BACKEND_URL}/health`);
    if (response.status === 200) {
      console.log('   ✅ Backend está funcionando');
      console.log(`   📊 Status: ${response.data.status || 'OK'}`);
      return true;
    } else {
      console.log(`   ❌ Backend devolvió status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error conectando al backend: ${error.message}`);
    return false;
  }
}

async function testFrontendAccess() {
  console.log('\n2️⃣  Probando acceso al frontend...');
  try {
    const response = await api.get(FRONTEND_URL);
    if (response.status === 200) {
      console.log('   ✅ Frontend está accesible');
      return true;
    } else {
      console.log(`   ❌ Frontend devolvió status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ⚠️  Frontend no está ejecutándose: ${error.message}`);
    console.log('   💡 Ejecutar: cd frontend && npm run dev');
    return false;
  }
}

async function testCORS() {
  console.log('\n3️⃣  Probando configuración CORS...');
  try {
    const response = await api.get(`${BACKEND_URL}/health`, {
      headers: {
        'Origin': FRONTEND_URL
      }
    });

    const corsHeaders = response.headers['access-control-allow-origin'];

    if (corsHeaders) {
      console.log('   ✅ CORS está configurado');
      console.log(`   🔓 Allowed origin: ${corsHeaders}`);
      return true;
    } else {
      console.log('   ⚠️  Headers CORS no encontrados');
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error probando CORS: ${error.message}`);
    return false;
  }
}

async function testAuthEndpoint() {
  console.log('\n4️⃣  Probando endpoint de autenticación...');
  try {
    // Intentar login con credenciales inválidas (esperamos 401)
    const response = await api.post(
      `${BACKEND_URL}/api/auth/login`,
      {
        email: 'test@test.com',
        password: 'test123'
      },
      {
        headers: {
          'Origin': FRONTEND_URL,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 401 || response.status === 400) {
      console.log('   ✅ Endpoint de autenticación responde correctamente');
      console.log(`   📝 Response: ${response.data.error || 'Invalid credentials'}`);
      return true;
    } else if (response.status === 200) {
      console.log('   ✅ Endpoint funciona (credenciales válidas)');
      return true;
    } else {
      console.log(`   ⚠️  Status inesperado: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error probando autenticación: ${error.message}`);
    return false;
  }
}

async function testAPIEndpoints() {
  console.log('\n5️⃣  Probando endpoints de API...');

  const endpoints = [
    { url: '/api/tickets', method: 'get', name: 'Tickets' },
    { url: '/api/contacts', method: 'get', name: 'Contacts' },
    { url: '/api/campaigns', method: 'get', name: 'Campaigns' },
  ];

  let successCount = 0;

  for (const endpoint of endpoints) {
    try {
      const response = await api.get(`${BACKEND_URL}${endpoint.url}`, {
        headers: {
          'Origin': FRONTEND_URL
        }
      });

      // 401 es esperado sin autenticación
      if (response.status === 401) {
        console.log(`   ✅ ${endpoint.name}: Requiere autenticación (correcto)`);
        successCount++;
      } else if (response.status === 200) {
        console.log(`   ✅ ${endpoint.name}: Responde OK`);
        successCount++;
      } else {
        console.log(`   ⚠️  ${endpoint.name}: Status ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ ${endpoint.name}: ${error.message}`);
    }
  }

  return successCount === endpoints.length;
}

async function testProxyConfiguration() {
  console.log('\n6️⃣  Verificando configuración de proxy en Vite...');
  try {
    // Intentar acceder a través del proxy del frontend
    const response = await api.get(`${FRONTEND_URL}/api/health`, {
      headers: {
        'Origin': FRONTEND_URL
      }
    });

    if (response.status === 200 || response.status === 404) {
      console.log('   ✅ Proxy de Vite parece estar configurado');
      return true;
    } else {
      console.log('   ⚠️  Proxy podría no estar funcionando');
      return false;
    }
  } catch (error) {
    console.log(`   ⚠️  No se pudo probar proxy: ${error.message}`);
    console.log('   💡 Asegúrate de que el frontend esté ejecutándose');
    return false;
  }
}

async function runTests() {
  console.log('\n🧪 INICIANDO TESTS DE INTEGRACIÓN\n');

  const results = [];

  results.push(await testBackendHealth());
  results.push(await testFrontendAccess());
  results.push(await testCORS());
  results.push(await testAuthEndpoint());
  results.push(await testAPIEndpoints());
  results.push(await testProxyConfiguration());

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTADOS FINALES');
  console.log('='.repeat(60));

  const passed = results.filter(r => r).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  console.log(`\n✅ Tests pasados: ${passed}/${total} (${percentage}%)`);

  if (passed === total) {
    console.log('\n🎉 ¡TODOS LOS TESTS PASARON!');
    console.log('✅ La integración Backend-Frontend está funcionando correctamente');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Crear usuario de prueba en el backend');
    console.log('   2. Probar login desde el frontend');
    console.log('   3. Verificar flujo completo de autenticación');
    process.exit(0);
  } else {
    console.log('\n⚠️  ALGUNOS TESTS FALLARON');
    console.log('\n🔧 Recomendaciones:');
    console.log('   1. Verificar que el backend esté ejecutándose: npm run dev');
    console.log('   2. Verificar que el frontend esté ejecutándose: cd frontend && npm run dev');
    console.log('   3. Verificar configuración de .env');
    console.log('   4. Verificar configuración CORS en app.ts');
    process.exit(1);
  }
}

// Ejecutar tests
runTests().catch(error => {
  console.error('\n❌ Error ejecutando tests:', error);
  process.exit(1);
});
