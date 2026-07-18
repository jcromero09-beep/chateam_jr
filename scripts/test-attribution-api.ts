/**
 * Script de prueba para APIs de Atribución
 * Ejecutar con: npx tsx scripts/test-attribution-api.ts
 */

const BASE_URL = process.env.API_URL || 'http://localhost:3001';

interface TestResult {
  endpoint: string;
  status: 'pass' | 'fail';
  statusCode?: number;
  message: string;
  data?: any;
}

const results: TestResult[] = [];

// Simular token de autenticación (deberás obtener uno real)
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || '';

async function testEndpoint(
  name: string,
  endpoint: string,
  method: string = 'GET'
): Promise<TestResult> {
  const url = `${BASE_URL}${endpoint}`;
  console.log(`\n🔍 Testing: ${name}`);
  console.log(`   ${method} ${url}`);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(AUTH_TOKEN ? { 'Authorization': `Bearer ${AUTH_TOKEN}` } : {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      console.log(`   ✅ Status: ${response.status}`);
      return {
        endpoint,
        status: 'pass',
        statusCode: response.status,
        message: 'OK',
        data
      };
    } else {
      console.log(`   ⚠️ Status: ${response.status} - ${data.error || 'Error'}`);
      return {
        endpoint,
        status: 'fail',
        statusCode: response.status,
        message: data.error || data.message || 'Unknown error',
        data
      };
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}`);
    return {
      endpoint,
      status: 'fail',
      message: error.message
    };
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   ATTRIBUTION API TEST SUITE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'Configured' : 'NOT CONFIGURED (will get 401)'}`);

  // Test 1: Health Check (sin autenticación)
  results.push(await testEndpoint('Health Check', '/health'));

  // Test 2: Dashboard principal
  results.push(await testEndpoint(
    'Attribution Dashboard',
    '/attribution/dashboard?period=30days&model=time_decay'
  ));

  // Test 3: Channel Attribution
  results.push(await testEndpoint(
    'Channel Attribution',
    '/attribution/channels?period=30days&model=time_decay'
  ));

  // Test 4: Customer Journeys
  results.push(await testEndpoint(
    'Customer Journeys',
    '/attribution/journeys?limit=10&offset=0'
  ));

  // Test 5: Aggregated Metrics
  results.push(await testEndpoint(
    'Aggregated Metrics',
    '/attribution/metrics?period=30days'
  ));

  // Test 6: Journey Detail (con ID de prueba)
  results.push(await testEndpoint(
    'Journey Detail',
    '/attribution/journey/test-journey-123'
  ));

  // Resumen
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('   TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;

  results.forEach(r => {
    const icon = r.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${r.endpoint}`);
    if (r.status === 'fail') {
      console.log(`   └─ ${r.message}`);
    }
  });

  console.log('\n───────────────────────────────────────────────────────');
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('───────────────────────────────────────────────────────');

  if (failed > 0 && !AUTH_TOKEN) {
    console.log('\n⚠️  NOTA: Los endpoints protegidos requieren un token de autenticación.');
    console.log('   Para probar con autenticación, ejecuta:');
    console.log('   TEST_AUTH_TOKEN="tu-token" npx tsx scripts/test-attribution-api.ts');
    console.log('\n   Para obtener un token, haz login en la aplicación y copia el token JWT.');
  }

  // Verificar si el servidor está corriendo
  const healthResult = results.find(r => r.endpoint === '/health');
  if (healthResult?.status === 'fail' && healthResult.message.includes('fetch failed')) {
    console.log('\n🚨 El servidor NO está corriendo en ' + BASE_URL);
    console.log('   Ejecuta el servidor con: npm run dev');
    console.log('   O: npm run dev:backend');
  }
}

// Ejecutar tests
runTests().catch(console.error);
