/**
 * 🏥 WHATSAPP SYSTEM HEALTH CHECK
 *
 * Script para verificar la salud completa del sistema anti-bloqueos WhatsApp
 * Verifica Fases 1, 2 y 3
 *
 * Uso: npx tsx scripts/whatsapp-system-healthcheck.ts
 *
 * @version 1.0.0
 * @date 14 de octubre de 2025
 */

import "dotenv/config";
// import "../bootstrap";  // No necesario para health check
// import chalk from "chalk";  // Vamos a usar console.log con colores básicos

interface HealthCheckResult {
  component: string;
  status: "✅ OK" | "⚠️ WARNING" | "❌ ERROR";
  message: string;
  details?: any;
}

const results: HealthCheckResult[] = [];

/**
 * Helper para agregar resultado
 */
function addResult(component: string, status: HealthCheckResult["status"], message: string, details?: any) {
  results.push({ component, status, message, details });
}

/**
 * 1. Verificar variables de entorno
 */
function checkEnvironmentVariables() {
  console.log(chalk.blue("\n🔍 Verificando variables de entorno..."));

  // Fase 1: Anti-Ban
  const fase1Vars = [
    "WHATSAPP_MAX_MESSAGES_PER_HOUR",
    "WHATSAPP_MIN_DELAY_MS",
    "WHATSAPP_MAX_DELAY_MS",
    "WHATSAPP_SIMULATE_TYPING",
    "WHATSAPP_TYPING_DURATION_MS",
    "WHATSAPP_ENABLE_RATE_LIMITING"
  ];

  let fase1OK = 0;
  fase1Vars.forEach(varName => {
    if (process.env[varName]) {
      fase1OK++;
    }
  });

  if (fase1OK === fase1Vars.length) {
    addResult("Fase 1 - Variables", "✅ OK", `${fase1OK}/${fase1Vars.length} variables configuradas`);
  } else {
    addResult("Fase 1 - Variables", "⚠️ WARNING", `${fase1OK}/${fase1Vars.length} variables configuradas`, { missing: fase1Vars.filter(v => !process.env[v]) });
  }

  // Fase 2: Monitoreo y Rate Limiting
  const fase2Vars = [
    "WHATSAPP_HEALTH_CHECK_INTERVAL",
    "WHATSAPP_METRICS_INTERVAL",
    "WHATSAPP_ENABLE_MONITORING",
    "WHATSAPP_REDIS_RATE_LIMIT",
    "WHATSAPP_RATE_LIMIT_PER_CONVERSATION",
    "WHATSAPP_RATE_LIMIT_PER_USER",
    "WHATSAPP_RATE_LIMIT_PER_WHATSAPP",
    "WHATSAPP_RATE_LIMIT_PER_COMPANY"
  ];

  let fase2OK = 0;
  fase2Vars.forEach(varName => {
    if (process.env[varName]) {
      fase2OK++;
    }
  });

  if (fase2OK === fase2Vars.length) {
    addResult("Fase 2 - Variables", "✅ OK", `${fase2OK}/${fase2Vars.length} variables configuradas`);
  } else {
    addResult("Fase 2 - Variables", "⚠️ WARNING", `${fase2OK}/${fase2Vars.length} variables configuradas`, { missing: fase2Vars.filter(v => !process.env[v]) });
  }

  // Fase 3: Sistema Híbrido
  const fase3Vars = [
    "WHATSAPP_HYBRID_MODE",
    "WHATSAPP_ENABLE_INTELLIGENT_ROUTING",
    "WHATSAPP_ENABLE_CIRCUIT_BREAKER",
    "WHATSAPP_CIRCUIT_BREAKER_THRESHOLD",
    "WHATSAPP_MAX_GLOBAL_RETRIES",
    "WHATSAPP_HIGH_VOLUME_THRESHOLD",
    "WHATSAPP_LOW_VOLUME_THRESHOLD"
  ];

  let fase3OK = 0;
  fase3Vars.forEach(varName => {
    if (process.env[varName]) {
      fase3OK++;
    }
  });

  if (fase3OK === fase3Vars.length) {
    addResult("Fase 3 - Variables", "✅ OK", `${fase3OK}/${fase3Vars.length} variables configuradas`);
  } else {
    addResult("Fase 3 - Variables", "⚠️ WARNING", `${fase3OK}/${fase3Vars.length} variables configuradas`, { missing: fase3Vars.filter(v => !process.env[v]) });
  }

  // Cloud API (opcional)
  const cloudAPIEnabled = process.env.WHATSAPP_CLOUD_API_ENABLED === "true";
  if (cloudAPIEnabled) {
    const cloudVars = [
      "WHATSAPP_CLOUD_API_PHONE_NUMBER_ID",
      "WHATSAPP_CLOUD_API_ACCESS_TOKEN"
    ];

    const hasAllCloudVars = cloudVars.every(v => process.env[v]);
    if (hasAllCloudVars) {
      addResult("Cloud API - Config", "✅ OK", "Cloud API habilitado y configurado");
    } else {
      addResult("Cloud API - Config", "❌ ERROR", "Cloud API habilitado pero faltan credenciales", { missing: cloudVars.filter(v => !process.env[v]) });
    }
  } else {
    addResult("Cloud API - Config", "✅ OK", "Cloud API deshabilitado (modo solo Baileys)");
  }
}

/**
 * 2. Verificar archivos del sistema
 */
async function checkSystemFiles() {
  console.log("\n🔍 Verificando archivos del sistema...");

  const fs = await import("fs/promises");
  const path = await import("path");

  const requiredFiles = [
    // Fase 1
    { path: "utils/antiBan.ts", phase: "Fase 1" },

    // Fase 2
    { path: "monitoring/whatsappMonitor.ts", phase: "Fase 2" },
    { path: "utils/rateLimiterRedis.ts", phase: "Fase 2" },
    { path: "controllers/WhatsAppMonitorController.ts", phase: "Fase 2" },
    { path: "routes/whatsappMonitorRoutes.ts", phase: "Fase 2" },

    // Fase 3
    { path: "services/WhatsAppCloudAPI/CloudAPIService.ts", phase: "Fase 3" },
    { path: "services/WhatsAppAdapter/DualAdapter.ts", phase: "Fase 3" },
    { path: "services/WhatsAppAdapter/IntelligentLoadBalancer.ts", phase: "Fase 3" },
    { path: "services/WhatsAppAdapter/HybridWhatsAppService.ts", phase: "Fase 3" }
  ];

  let filesOK = 0;
  let filesMissing: string[] = [];

  for (const file of requiredFiles) {
    const fullPath = path.join(process.cwd(), file.path);
    try {
      await fs.access(fullPath);
      filesOK++;
    } catch {
      filesMissing.push(`${file.phase}: ${file.path}`);
    }
  }

  if (filesOK === requiredFiles.length) {
    addResult("Archivos del Sistema", "✅ OK", `${filesOK}/${requiredFiles.length} archivos encontrados`);
  } else {
    addResult("Archivos del Sistema", "❌ ERROR", `${filesOK}/${requiredFiles.length} archivos encontrados`, { missing: filesMissing });
  }
}

/**
 * 3. Verificar configuración de Redis
 */
async function checkRedis() {
  console.log(chalk.blue("\n🔍 Verificando conexión a Redis..."));

  const redisEnabled = process.env.WHATSAPP_REDIS_RATE_LIMIT === "true";

  if (!redisEnabled) {
    addResult("Redis", "✅ OK", "Redis rate limiting deshabilitado (usando NodeCache)");
    return;
  }

  try {
    const { createClient } = await import("redis");

    const client = createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379")
      },
      password: process.env.REDIS_PASSWORD || undefined
    });

    await client.connect();
    await client.ping();
    await client.disconnect();

    addResult("Redis", "✅ OK", `Conexión exitosa a ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  } catch (error: any) {
    addResult("Redis", "❌ ERROR", "No se pudo conectar a Redis", { error: error.message });
  }
}

/**
 * 4. Verificar configuración del sistema
 */
function checkSystemConfiguration() {
  console.log(chalk.blue("\n🔍 Verificando configuración del sistema..."));

  // Verificar modo híbrido
  const hybridMode = process.env.WHATSAPP_HYBRID_MODE || "baileys_only";
  const validModes = ["auto", "baileys_only", "cloud_only", "baileys_first", "cloud_first"];

  if (validModes.includes(hybridMode)) {
    addResult("Modo Híbrido", "✅ OK", `Modo configurado: ${hybridMode}`);
  } else {
    addResult("Modo Híbrido", "❌ ERROR", `Modo inválido: ${hybridMode}`, { validModes });
  }

  // Verificar intervalos de monitoreo
  const healthCheckInterval = parseInt(process.env.WHATSAPP_HEALTH_CHECK_INTERVAL || "30000");
  const metricsInterval = parseInt(process.env.WHATSAPP_METRICS_INTERVAL || "60000");

  if (healthCheckInterval >= 10000 && healthCheckInterval <= 300000) {
    addResult("Health Check Interval", "✅ OK", `${healthCheckInterval}ms (${healthCheckInterval / 1000}s)`);
  } else {
    addResult("Health Check Interval", "⚠️ WARNING", `${healthCheckInterval}ms fuera del rango recomendado (10-300s)`);
  }

  if (metricsInterval >= 30000 && metricsInterval <= 600000) {
    addResult("Metrics Interval", "✅ OK", `${metricsInterval}ms (${metricsInterval / 1000}s)`);
  } else {
    addResult("Metrics Interval", "⚠️ WARNING", `${metricsInterval}ms fuera del rango recomendado (30-600s)`);
  }

  // Verificar delays anti-ban
  const minDelay = parseInt(process.env.WHATSAPP_MIN_DELAY_MS || "2000");
  const maxDelay = parseInt(process.env.WHATSAPP_MAX_DELAY_MS || "5000");

  if (minDelay >= 1000 && maxDelay <= 10000 && minDelay < maxDelay) {
    addResult("Anti-Ban Delays", "✅ OK", `${minDelay}ms - ${maxDelay}ms`);
  } else {
    addResult("Anti-Ban Delays", "⚠️ WARNING", "Delays fuera del rango recomendado", { minDelay, maxDelay, recommended: "1000-10000ms" });
  }

  // Verificar límites de rate limiting
  const conversationLimit = parseInt(process.env.WHATSAPP_RATE_LIMIT_PER_CONVERSATION || "30");
  const userLimit = parseInt(process.env.WHATSAPP_RATE_LIMIT_PER_USER || "100");

  if (conversationLimit <= 50 && userLimit <= 200) {
    addResult("Rate Limits", "✅ OK", `Conversación: ${conversationLimit}/h, Usuario: ${userLimit}/h`);
  } else {
    addResult("Rate Limits", "⚠️ WARNING", "Límites muy altos (riesgo de bloqueo)", { conversationLimit, userLimit });
  }
}

/**
 * 5. Imprimir reporte final
 */
function printReport() {
  console.log(chalk.bold("\n" + "=".repeat(70)));
  console.log(chalk.bold.cyan("📊 REPORTE DE SALUD DEL SISTEMA ANTI-BLOQUEOS WHATSAPP"));
  console.log(chalk.bold("=".repeat(70) + "\n"));

  let totalOK = 0;
  let totalWarning = 0;
  let totalError = 0;

  results.forEach(result => {
    let color: any = chalk.green;
    if (result.status === "⚠️ WARNING") {
      color = chalk.yellow;
      totalWarning++;
    } else if (result.status === "❌ ERROR") {
      color = chalk.red;
      totalError++;
    } else {
      totalOK++;
    }

    console.log(color(`${result.status} ${result.component}`));
    console.log(color(`   ${result.message}`));

    if (result.details) {
      console.log(chalk.gray(`   Detalles: ${JSON.stringify(result.details, null, 2)}`));
    }

    console.log("");
  });

  console.log(chalk.bold("=".repeat(70)));
  console.log(chalk.bold("\n📈 RESUMEN:"));
  console.log(chalk.green(`   ✅ OK: ${totalOK}`));
  console.log(chalk.yellow(`   ⚠️  WARNING: ${totalWarning}`));
  console.log(chalk.red(`   ❌ ERROR: ${totalError}`));

  console.log(chalk.bold("\n🎯 ESTADO GENERAL:"));
  if (totalError === 0 && totalWarning === 0) {
    console.log(chalk.green.bold("   ✅ SISTEMA COMPLETAMENTE SALUDABLE"));
    console.log(chalk.green("   Todas las verificaciones pasaron exitosamente."));
  } else if (totalError === 0) {
    console.log(chalk.yellow.bold("   ⚠️  SISTEMA FUNCIONAL CON ADVERTENCIAS"));
    console.log(chalk.yellow("   El sistema funciona pero hay recomendaciones de mejora."));
  } else {
    console.log(chalk.red.bold("   ❌ SISTEMA CON ERRORES"));
    console.log(chalk.red("   Hay errores críticos que deben ser resueltos."));
  }

  console.log(chalk.bold("\n" + "=".repeat(70) + "\n"));

  // Exit code
  process.exit(totalError > 0 ? 1 : 0);
}

/**
 * Ejecutar health check
 */
async function runHealthCheck() {
  console.log(chalk.bold.cyan("\n🏥 INICIANDO HEALTH CHECK DEL SISTEMA WHATSAPP...\n"));

  try {
    await checkEnvironmentVariables();
    await checkSystemFiles();
    await checkRedis();
    await checkSystemConfiguration();

    printReport();
  } catch (error: any) {
    console.error(chalk.red("\n❌ Error ejecutando health check:"), error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runHealthCheck();
}

export default runHealthCheck;
