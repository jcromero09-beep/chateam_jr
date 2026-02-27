/**
 * 🏥 SIMPLE WHATSAPP HEALTH CHECK
 * Versión simplificada sin dependencias externas
 */

import "dotenv/config";
import { existsSync } from "fs";
import { join } from "path";

console.log("\n🏥 INICIANDO HEALTH CHECK DEL SISTEMA WHATSAPP...\n");

let totalOK = 0;
let totalWarning = 0;
let totalError = 0;

function checkOK(component: string, message: string) {
  console.log(`✅ OK ${component}`);
  console.log(`   ${message}\n`);
  totalOK++;
}

function checkWarning(component: string, message: string) {
  console.log(`⚠️  WARNING ${component}`);
  console.log(`   ${message}\n`);
  totalWarning++;
}

function checkError(component: string, message: string) {
  console.log(`❌ ERROR ${component}`);
  console.log(`   ${message}\n`);
  totalError++;
}

// 1. Verificar variables de entorno
console.log("🔍 Verificando variables de entorno...\n");

const fase1Vars = [
  "WHATSAPP_MAX_MESSAGES_PER_HOUR",
  "WHATSAPP_MIN_DELAY_MS",
  "WHATSAPP_MAX_DELAY_MS",
  "WHATSAPP_SIMULATE_TYPING",
  "WHATSAPP_TYPING_DURATION_MS",
  "WHATSAPP_ENABLE_RATE_LIMITING"
];

const fase1OK = fase1Vars.filter(v => process.env[v]).length;
if (fase1OK === fase1Vars.length) {
  checkOK("Fase 1 - Variables", `${fase1OK}/${fase1Vars.length} variables configuradas`);
} else {
  checkWarning("Fase 1 - Variables", `${fase1OK}/${fase1Vars.length} variables configuradas`);
}

const fase2Vars = [
  "WHATSAPP_HEALTH_CHECK_INTERVAL",
  "WHATSAPP_METRICS_INTERVAL",
  "WHATSAPP_ENABLE_MONITORING"
];

const fase2OK = fase2Vars.filter(v => process.env[v]).length;
if (fase2OK === fase2Vars.length) {
  checkOK("Fase 2 - Variables", `${fase2OK}/${fase2Vars.length} variables configuradas`);
} else {
  checkWarning("Fase 2 - Variables", `${fase2OK}/${fase2Vars.length} variables configuradas`);
}

const fase3Vars = [
  "WHATSAPP_HYBRID_MODE",
  "WHATSAPP_ENABLE_INTELLIGENT_ROUTING",
  "WHATSAPP_ENABLE_CIRCUIT_BREAKER"
];

const fase3OK = fase3Vars.filter(v => process.env[v]).length;
if (fase3OK === fase3Vars.length) {
  checkOK("Fase 3 - Variables", `${fase3OK}/${fase3Vars.length} variables configuradas`);
} else {
  checkWarning("Fase 3 - Variables", `${fase3OK}/${fase3Vars.length} variables configuradas`);
}

// Cloud API
const cloudAPIEnabled = process.env.WHATSAPP_CLOUD_API_ENABLED === "true";
if (cloudAPIEnabled) {
  const hasCredentials = process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID && process.env.WHATSAPP_CLOUD_API_ACCESS_TOKEN;
  if (hasCredentials) {
    checkOK("Cloud API", "Cloud API habilitado y configurado");
  } else {
    checkError("Cloud API", "Cloud API habilitado pero faltan credenciales");
  }
} else {
  checkOK("Cloud API", "Cloud API deshabilitado (modo solo Baileys)");
}

// 2. Verificar archivos del sistema
console.log("🔍 Verificando archivos del sistema...\n");

const requiredFiles = [
  "utils/antiBan.ts",
  "monitoring/whatsappMonitor.ts",
  "utils/rateLimiterRedis.ts",
  "controllers/WhatsAppMonitorController.ts",
  "routes/whatsappMonitorRoutes.ts",
  "services/WhatsAppCloudAPI/CloudAPIService.ts",
  "services/WhatsAppAdapter/DualAdapter.ts",
  "services/WhatsAppAdapter/IntelligentLoadBalancer.ts",
  "services/WhatsAppAdapter/HybridWhatsAppService.ts"
];

let filesOK = 0;
let filesMissing: string[] = [];

requiredFiles.forEach(file => {
  const fullPath = join(process.cwd(), file);
  if (existsSync(fullPath)) {
    filesOK++;
  } else {
    filesMissing.push(file);
  }
});

if (filesOK === requiredFiles.length) {
  checkOK("Archivos del Sistema", `${filesOK}/${requiredFiles.length} archivos encontrados`);
} else {
  checkError("Archivos del Sistema", `${filesOK}/${requiredFiles.length} archivos encontrados. Faltantes: ${filesMissing.join(", ")}`);
}

// 3. Verificar configuración
console.log("🔍 Verificando configuración...\n");

const hybridMode = process.env.WHATSAPP_HYBRID_MODE || "baileys_only";
const validModes = ["auto", "baileys_only", "cloud_only", "baileys_first", "cloud_first"];

if (validModes.includes(hybridMode)) {
  checkOK("Modo Híbrido", `Modo configurado: ${hybridMode}`);
} else {
  checkError("Modo Híbrido", `Modo inválido: ${hybridMode}`);
}

const healthCheckInterval = parseInt(process.env.WHATSAPP_HEALTH_CHECK_INTERVAL || "30000");
if (healthCheckInterval >= 10000 && healthCheckInterval <= 300000) {
  checkOK("Health Check Interval", `${healthCheckInterval}ms (${healthCheckInterval / 1000}s)`);
} else {
  checkWarning("Health Check Interval", `${healthCheckInterval}ms fuera del rango recomendado`);
}

const minDelay = parseInt(process.env.WHATSAPP_MIN_DELAY_MS || "2000");
const maxDelay = parseInt(process.env.WHATSAPP_MAX_DELAY_MS || "5000");

if (minDelay >= 1000 && maxDelay <= 10000 && minDelay < maxDelay) {
  checkOK("Anti-Ban Delays", `${minDelay}ms - ${maxDelay}ms`);
} else {
  checkWarning("Anti-Ban Delays", "Delays fuera del rango recomendado");
}

// Resumen final
console.log("=".repeat(70));
console.log("\n📈 RESUMEN:");
console.log(`   ✅ OK: ${totalOK}`);
console.log(`   ⚠️  WARNING: ${totalWarning}`);
console.log(`   ❌ ERROR: ${totalError}`);

console.log("\n🎯 ESTADO GENERAL:");
if (totalError === 0 && totalWarning === 0) {
  console.log("   ✅ SISTEMA COMPLETAMENTE SALUDABLE");
  console.log("   Todas las verificaciones pasaron exitosamente.\n");
} else if (totalError === 0) {
  console.log("   ⚠️  SISTEMA FUNCIONAL CON ADVERTENCIAS");
  console.log("   El sistema funciona pero hay recomendaciones de mejora.\n");
} else {
  console.log("   ❌ SISTEMA CON ERRORES");
  console.log("   Hay errores críticos que deben ser resueltos.\n");
}

console.log("=".repeat(70) + "\n");

process.exit(totalError > 0 ? 1 : 0);
