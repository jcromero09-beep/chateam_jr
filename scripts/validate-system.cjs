#!/usr/bin/env node

/**
 * SCRIPT DE VALIDACIÓN RÁPIDA DEL SISTEMA CHATEAM
 * Verifica que todo esté listo para deploy en producción
 */

const fs = require('fs');
const path = require('path');

class SystemValidator {
  constructor() {
    this.results = [];
    this.projectRoot = process.cwd();
  }

  // Ejecutar todas las validaciones
  async validate() {
    console.log('🚀 VALIDACIÓN SISTEMA CHATEAM v1.0.0\n');
    console.log('🔍 Verificando readiness para producción...\n');

    this.validateStructure();
    this.validateDependencies();
    this.validateEnvironment();
    this.validateDatabase();
    this.validateMultiTenant();
    this.validateInfrastructure();
    this.validateMonitoring();

    this.generateReport();
  }

  // Validar estructura de archivos críticos
  validateStructure() {
    this.logSection('📁 ESTRUCTURA DEL PROYECTO');

    const criticalFiles = [
      'package.json',
      'docker-compose.yml',
      'docker-compose.production.yml',
      '.env.production.template',
      'ROADMAP.md'
    ];

    criticalFiles.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult('structure', exists ? 'PASS' : 'FAIL',
        `${file}: ${exists ? 'OK' : 'FALTANTE'}`, true);
    });

    // Validar fases del proyecto
    const phases = {
      'Fase 1 - Multi-tenant': [
        'database/migrations/20250101000000-implement-multi-tenant-schema.ts',
        'helpers/TenantManager.ts',
        'middleware/tenantMiddleware.ts'
      ],
      'Fase 2 - IA': [
        'meta-marketing/src/client.ts',
        'audit-service/src/server.ts'
      ],
      'Fase 3 - UI/UX': [
        'src/theme/index.tsx',
        'src/pages/Marketing/Dashboard/index.tsx',
        'tooltips/es.json'
      ],
      'Fase 4 - Infraestructura': [
        'monitoring/prometheus.yml',
        'monitoring/alerts.yml',
        'docs/INFRASTRUCTURE.md'
      ]
    };

    Object.entries(phases).forEach(([phase, files]) => {
      const existing = files.filter(file =>
        fs.existsSync(path.join(this.projectRoot, file))
      );

      const completion = Math.round((existing.length / files.length) * 100);
      this.addResult('phases', completion >= 80 ? 'PASS' : 'FAIL',
        `${phase}: ${completion}% (${existing.length}/${files.length})`,
        phase.includes('Fase 1') || phase.includes('Fase 4'));
    });
  }

  // Validar dependencias
  validateDependencies() {
    this.logSection('📦 DEPENDENCIAS');

    try {
      const packageJson = JSON.parse(fs.readFileSync(
        path.join(this.projectRoot, 'package.json'), 'utf8'
      ));

      // Verificar dependencias críticas
      const criticalDeps = [
        'express', 'sequelize', 'pg', 'redis', 'stripe',
        'jsonwebtoken', 'bcryptjs', 'cors'
      ];

      const missingDeps = criticalDeps.filter(dep =>
        !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      );

      this.addResult('dependencies', missingDeps.length === 0 ? 'PASS' : 'FAIL',
        missingDeps.length === 0 ? 'Dependencias críticas OK' :
        `Faltantes: ${missingDeps.join(', ')}`, true);

      // Verificar node_modules
      const nodeModulesExists = fs.existsSync(path.join(this.projectRoot, 'node_modules'));
      this.addResult('dependencies', nodeModulesExists ? 'PASS' : 'FAIL',
        `node_modules: ${nodeModulesExists ? 'Instalado' : 'NO INSTALADO'}`, true);

    } catch (error) {
      this.addResult('dependencies', 'FAIL', `Error: ${error.message}`, true);
    }
  }

  // Validar configuración de entorno
  validateEnvironment() {
    this.logSection('⚙️ CONFIGURACIÓN DE ENTORNO');

    const envTemplate = path.join(this.projectRoot, '.env.production.template');
    const envExists = fs.existsSync(envTemplate);

    this.addResult('environment', envExists ? 'PASS' : 'FAIL',
      `.env.production.template: ${envExists ? 'OK' : 'FALTANTE'}`, true);

    if (envExists) {
      try {
        const content = fs.readFileSync(envTemplate, 'utf8');

        // Variables críticas
        const criticalVars = [
          'NODE_ENV', 'DB_HOST', 'DB_PASSWORD', 'JWT_SECRET',
          'STRIPE_SECRET_KEY', 'OPENAI_API_KEY', 'REDIS_PASSWORD'
        ];

        const missingVars = criticalVars.filter(v => !content.includes(v));

        this.addResult('environment', missingVars.length === 0 ? 'PASS' : 'FAIL',
          missingVars.length === 0 ? 'Variables críticas OK' :
          `Faltantes: ${missingVars.join(', ')}`, true);

        // Verificar que no hay secretos reales
        const hasSecrets = content.includes('sk_live_') || content.includes('password123');
        this.addResult('environment', !hasSecrets ? 'PASS' : 'WARNING',
          hasSecrets ? 'ADVERTENCIA: Contiene secretos' : 'Sin secretos expuestos', false);

      } catch (error) {
        this.addResult('environment', 'FAIL', `Error leyendo template: ${error.message}`, true);
      }
    }
  }

  // Validar base de datos
  validateDatabase() {
    this.logSection('🗄️ BASE DE DATOS');

    // Migraciones
    const migrationsDir = path.join(this.projectRoot, 'database/migrations');
    const migrationsExist = fs.existsSync(migrationsDir);

    this.addResult('database', migrationsExist ? 'PASS' : 'FAIL',
      `Directorio migraciones: ${migrationsExist ? 'OK' : 'FALTANTE'}`, true);

    if (migrationsExist) {
      const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.ts'));

      this.addResult('database', migrationFiles.length > 0 ? 'PASS' : 'FAIL',
        `Archivos migración: ${migrationFiles.length}`, true);

      // Migraciones críticas para multi-tenant
      const criticalMigrations = [
        '20250101000000-implement-multi-tenant-schema.ts',
        '20250101000001-create-tenants-table.ts'
      ];

      const hasCritical = criticalMigrations.some(m => migrationFiles.includes(m));
      this.addResult('database', hasCritical ? 'PASS' : 'FAIL',
        `Migraciones multi-tenant: ${hasCritical ? 'OK' : 'FALTANTES'}`, true);
    }

    // Modelos principales
    const models = [
      'models/CompanyBilling.ts',
      'models/Invoice.ts',
      'models/Media.ts',
      'models/LeadSource.ts'
    ];

    const modelCount = models.filter(m =>
      fs.existsSync(path.join(this.projectRoot, m))
    ).length;

    this.addResult('database', modelCount >= 2 ? 'PASS' : 'WARNING',
      `Modelos implementados: ${modelCount}/${models.length}`, false);
  }

  // Validar sistema multi-tenant
  validateMultiTenant() {
    this.logSection('🏢 SISTEMA MULTI-TENANT');

    // TenantManager
    const tenantManager = path.join(this.projectRoot, 'helpers/TenantManager.ts');
    const tmExists = fs.existsSync(tenantManager);

    this.addResult('multi-tenant', tmExists ? 'PASS' : 'FAIL',
      `TenantManager: ${tmExists ? 'Implementado' : 'FALTANTE'}`, true);

    if (tmExists) {
      try {
        const content = fs.readFileSync(tenantManager, 'utf8');
        const methods = [
          'getTenantByIdentifier', 'createTenant', 'setSearchPath',
          'resetSearchPath', 'schemaExists'
        ];

        const hasAllMethods = methods.every(m => content.includes(m));
        this.addResult('multi-tenant', hasAllMethods ? 'PASS' : 'FAIL',
          `Métodos TenantManager: ${hasAllMethods ? 'Completos' : 'INCOMPLETOS'}`, true);
      } catch (error) {
        this.addResult('multi-tenant', 'FAIL', `Error: ${error.message}`, true);
      }
    }

    // Middleware
    const middleware = path.join(this.projectRoot, 'middleware/tenantMiddleware.ts');
    const middlewareExists = fs.existsSync(middleware);

    this.addResult('multi-tenant', middlewareExists ? 'PASS' : 'FAIL',
      `Tenant Middleware: ${middlewareExists ? 'OK' : 'FALTANTE'}`, true);

    // Documentación
    const docs = path.join(this.projectRoot, 'docs/MULTI-TENANT.md');
    const docsExist = fs.existsSync(docs);

    this.addResult('multi-tenant', docsExist ? 'PASS' : 'WARNING',
      `Documentación: ${docsExist ? 'Completa' : 'FALTANTE'}`, false);
  }

  // Validar infraestructura
  validateInfrastructure() {
    this.logSection('🐳 INFRAESTRUCTURA');

    // Docker files
    const dockerFiles = [
      'docker-compose.yml',
      'docker-compose.production.yml'
    ];

    dockerFiles.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult('infrastructure', exists ? 'PASS' : 'FAIL',
        `${file}: ${exists ? 'OK' : 'FALTANTE'}`, file.includes('production'));
    });

    // Verificar servicios en docker-compose production
    const prodCompose = path.join(this.projectRoot, 'docker-compose.production.yml');
    if (fs.existsSync(prodCompose)) {
      try {
        const content = fs.readFileSync(prodCompose, 'utf8');
        const services = ['app', 'postgres', 'redis', 'nginx', 'prometheus'];
        const hasServices = services.filter(s => content.includes(`${s}:`));

        this.addResult('infrastructure', hasServices.length >= 4 ? 'PASS' : 'WARNING',
          `Servicios Docker: ${hasServices.length}/${services.length}`, false);

        // Verificar configuración de producción
        const hasHA = content.includes('replicas:') && content.includes('cpus:');
        this.addResult('infrastructure', hasHA ? 'PASS' : 'WARNING',
          `Configuración HA: ${hasHA ? 'Configurada' : 'Básica'}`, false);

      } catch (error) {
        this.addResult('infrastructure', 'WARNING', `Error: ${error.message}`, false);
      }
    }

    // Script de deploy
    const deployScript = path.join(this.projectRoot, 'scripts/deploy-production.sh');
    const scriptExists = fs.existsSync(deployScript);

    this.addResult('infrastructure', scriptExists ? 'PASS' : 'WARNING',
      `Script deploy: ${scriptExists ? 'Presente' : 'FALTANTE'}`, false);
  }

  // Validar monitoreo
  validateMonitoring() {
    this.logSection('📊 MONITOREO');

    // Archivos de configuración
    const monitoringFiles = [
      'monitoring/prometheus.yml',
      'monitoring/alerts.yml',
      'monitoring/alertmanager.yml'
    ];

    const monitoringCount = monitoringFiles.filter(f =>
      fs.existsSync(path.join(this.projectRoot, f))
    ).length;

    this.addResult('monitoring', monitoringCount >= 2 ? 'PASS' : 'FAIL',
      `Configuración monitoreo: ${monitoringCount}/${monitoringFiles.length}`, true);

    // Health checks
    const healthRoutes = path.join(this.projectRoot, 'src/routes/healthRoutes.ts');
    const healthExists = fs.existsSync(healthRoutes);

    this.addResult('monitoring', healthExists ? 'PASS' : 'FAIL',
      `Health endpoints: ${healthExists ? 'Implementados' : 'FALTANTES'}`, true);

    // Verificar alertas
    const alertsFile = path.join(this.projectRoot, 'monitoring/alerts.yml');
    if (fs.existsSync(alertsFile)) {
      try {
        const content = fs.readFileSync(alertsFile, 'utf8');
        const alertCount = (content.match(/- alert:/g) || []).length;

        this.addResult('monitoring', alertCount >= 10 ? 'PASS' : 'WARNING',
          `Reglas de alertas: ${alertCount}`, false);
      } catch (error) {
        this.addResult('monitoring', 'WARNING', `Error: ${error.message}`, false);
      }
    }

    // Documentación de infraestructura
    const infraDocs = path.join(this.projectRoot, 'docs/INFRASTRUCTURE.md');
    const infraDocsExist = fs.existsSync(infraDocs);

    this.addResult('monitoring', infraDocsExist ? 'PASS' : 'WARNING',
      `Docs infraestructura: ${infraDocsExist ? 'Completa' : 'FALTANTE'}`, false);
  }

  // Generar reporte final
  generateReport() {
    console.log('\n' + '='.repeat(70));
    console.log('📋 REPORTE DE VALIDACIÓN - CHATEAM v1.0.0');
    console.log('='.repeat(70));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;
    const critical = this.results.filter(r => r.status === 'FAIL' && r.critical).length;

    console.log(`\n📊 ESTADÍSTICAS:`);
    console.log(`   ✅ Pasaron: ${passed}`);
    console.log(`   ❌ Fallaron: ${failed} (${critical} críticos)`);
    console.log(`   ⚠️  Advertencias: ${warnings}`);
    console.log(`   📊 Total: ${this.results.length}`);

    const successRate = Math.round((passed / this.results.length) * 100);
    console.log(`\n🎯 TASA DE ÉXITO: ${successRate}%`);

    // Estado del deploy
    console.log('\n' + '='.repeat(70));
    if (critical === 0 && failed <= 3) {
      console.log('🚀 ESTADO: ✅ LISTO PARA DEPLOY');
      console.log('   Sistema cumple requisitos para producción');
    } else if (critical <= 2) {
      console.log('🚀 ESTADO: ⚠️  DEPLOY CON PRECAUCIÓN');
      console.log('   Sistema funcional con elementos por mejorar');
    } else {
      console.log('🚀 ESTADO: ❌ NO LISTO PARA DEPLOY');
      console.log('   Requiere correcciones críticas');
    }

    // Fallos críticos
    const criticalFailures = this.results.filter(r => r.status === 'FAIL' && r.critical);
    if (criticalFailures.length > 0) {
      console.log('\n🚨 ELEMENTOS CRÍTICOS A CORREGIR:');
      criticalFailures.forEach(failure => {
        console.log(`   ❌ ${failure.message}`);
      });
    }

    // Recomendaciones
    console.log('\n🔧 PRÓXIMOS PASOS:');
    if (critical > 0) {
      console.log('   1. Corregir fallos críticos listados arriba');
      console.log('   2. Re-ejecutar validación');
      console.log('   3. Verificar configuración manual');
    } else {
      console.log('   1. Configurar variables .env.production');
      console.log('   2. Revisar secretos y credenciales');
      console.log('   3. Ejecutar migraciones de DB');
      console.log('   4. Iniciar deploy: ./scripts/deploy-production.sh');
    }

    console.log('\n✨ CHATEAM v1.0.0 - VALIDACIÓN COMPLETADA');
    console.log('='.repeat(70) + '\n');

    // Return appropriate exit code
    return critical > 0 ? 1 : 0;
  }

  // Helper methods
  addResult(category, status, message, critical = false) {
    this.results.push({ category, status, message, critical });

    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${message}`);
  }

  logSection(title) {
    console.log(`\n${title}`);
    console.log('-'.repeat(title.length));
  }
}

// Ejecutar validación
(async () => {
  const validator = new SystemValidator();

  try {
    await validator.validate();
    const exitCode = validator.generateReport();
    process.exit(exitCode);
  } catch (error) {
    console.error('❌ Error durante validación:', error.message);
    process.exit(1);
  }
})();