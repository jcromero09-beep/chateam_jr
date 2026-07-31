#!/usr/bin/env ts-node

/**
 * SCRIPT DE VALIDACIÓN PRE-DEPLOY
 * Verifica que todo el sistema Chateam esté listo para despliegue en producción
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationResult {
  category: string;
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'SKIP';
  message: string;
  details?: any;
  critical: boolean;
}

class PreDeployValidator {
  private results: ValidationResult[] = [];
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  /**
   * Ejecuta todas las validaciones de pre-deploy
   */
  async validate(): Promise<ValidationResult[]> {
    console.log('🚀 VALIDACIÓN PRE-DEPLOY CHATEAM v1.0.0\n');
    console.log('🔍 Verificando que el sistema esté listo para producción...\n');

    // Validaciones por categoría
    await this.validateProjectStructure();
    await this.validateDependencies();
    await this.validateEnvironmentConfig();
    await this.validateDatabaseSetup();
    await this.validateMultiTenant();
    await this.validateInfrastructure();
    await this.validateMonitoring();
    await this.validateSecurity();
    await this.validatePerformance();
    await this.validateDocumentation();

    return this.results;
  }

  /**
   * Validar estructura del proyecto
   */
  async validateProjectStructure(): Promise<void> {
    this.logSection('📁 ESTRUCTURA DEL PROYECTO');

    // Archivos críticos
    const criticalFiles = [
      'package.json',
      'docker-compose.yml',
      'docker-compose.production.yml',
      '.env.production.template',
      'ROADMAP.md'
    ];

    criticalFiles.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult('structure', 'critical-files', exists ? 'PASS' : 'FAIL',
        `${file}: ${exists ? 'Encontrado' : 'FALTANTE'}`, null, true);
    });

    // Directorios esenciales
    const essentialDirs = [
      'src',
      'database/migrations',
      'helpers',
      'middleware',
      'controllers',
      'services',
      'routes',
      'monitoring',
      'scripts',
      'docs'
    ];

    essentialDirs.forEach(dir => {
      const exists = fs.existsSync(path.join(this.projectRoot, dir));
      this.addResult('structure', 'directories', exists ? 'PASS' : 'FAIL',
        `${dir}/: ${exists ? 'Existe' : 'FALTANTE'}`, null, dir === 'src' || dir === 'database/migrations');
    });

    // Archivos de Fase 1
    const phase1Files = [
      'database/migrations/20250101000000-implement-multi-tenant-schema.ts',
      'database/migrations/20250101000001-create-tenants-table.ts',
      'helpers/TenantManager.ts',
      'middleware/tenantMiddleware.ts',
      'models/Media.ts',
      'services/FileLifecycleService.ts'
    ];

    // NOTA (2026-07-30): de estas listas se quitaron StripeService, Invoice,
    // CompanyBilling y Refund. Estaban en cuarentena por no haber funcionado
    // NUNCA —modelos sin registrar contra tablas inexistentes—, y su presencia
    // aquí ilustra el límite de este chequeo: **comprobar que un fichero existe
    // no dice nada sobre si funciona**. Esta validación estuvo dando verde
    // durante meses sobre una pila de billing que no podía ejecutarse.
    let phase1Complete = 0;
    phase1Files.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      if (exists) phase1Complete++;
    });

    this.addResult('structure', 'phase1', phase1Complete === phase1Files.length ? 'PASS' : 'FAIL',
      `Fase 1 - Fundamentos: ${phase1Complete}/${phase1Files.length} archivos`, null, true);

    // Archivos de Fase 2
    const phase2Files = [
      'meta-marketing/src/client.ts',
      'meta-marketing/src/campaigns.ts',
      'meta-marketing/src/insights.ts',
      'audit-service/src/server.ts',
      'audit-service/src/services/auditService.ts',
      'models/LeadSource.ts',
      'services/AttributionService.ts'
    ];

    let phase2Complete = 0;
    phase2Files.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      if (exists) phase2Complete++;
    });

    this.addResult('structure', 'phase2', phase2Complete >= phase2Files.length * 0.8 ? 'PASS' : 'WARNING',
      `Fase 2 - IA: ${phase2Complete}/${phase2Files.length} archivos`, null, false);

    // Archivos de Fase 3
    const phase3Files = [
      'src/theme/index.tsx',
      'src/components/Layout/AppLayout.tsx',
      'src/components/Common/Tooltip/index.tsx',
      'src/pages/Marketing/Dashboard/index.tsx',
      'src/services/marketingApi.ts',
      'src/hooks/useMarketingDashboard.ts',
      'tooltips/es.json'
    ];

    let phase3Complete = 0;
    phase3Files.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      if (exists) phase3Complete++;
    });

    this.addResult('structure', 'phase3', phase3Complete >= phase3Files.length * 0.8 ? 'PASS' : 'WARNING',
      `Fase 3 - UI/UX: ${phase3Complete}/${phase3Files.length} archivos`, null, false);

    // Archivos de Fase 4
    const phase4Files = [
      'monitoring/prometheus.yml',
      'monitoring/alerts.yml',
      'monitoring/alertmanager.yml',
      'src/routes/healthRoutes.ts',
      'docs/INFRASTRUCTURE.md',
      'scripts/deploy-production.sh'
    ];

    let phase4Complete = 0;
    phase4Files.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      if (exists) phase4Complete++;
    });

    this.addResult('structure', 'phase4', phase4Complete === phase4Files.length ? 'PASS' : 'FAIL',
      `Fase 4 - Infraestructura: ${phase4Complete}/${phase4Files.length} archivos`, null, true);
  }

  /**
   * Validar dependencias
   */
  async validateDependencies(): Promise<void> {
    this.logSection('📦 DEPENDENCIAS');

    try {
      // Verificar package.json
      const packageJson = JSON.parse(fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8'));

      // Dependencias críticas
      const criticalDeps = [
        'express', 'sequelize', 'pg', 'redis', 'stripe', 'jsonwebtoken',
        'bcryptjs', 'cors', 'helmet', 'express-rate-limit'
      ];

      const missingDeps = criticalDeps.filter(dep =>
        !packageJson.dependencies?.[dep] && !packageJson.devDependencies?.[dep]
      );

      this.addResult('dependencies', 'critical', missingDeps.length === 0 ? 'PASS' : 'FAIL',
        missingDeps.length === 0 ? 'Todas las dependencias críticas presentes' : `Faltantes: ${missingDeps.join(', ')}`,
        null, true);

      // Verificar node_modules
      const nodeModulesExists = fs.existsSync(path.join(this.projectRoot, 'node_modules'));
      this.addResult('dependencies', 'installed', nodeModulesExists ? 'PASS' : 'FAIL',
        `node_modules: ${nodeModulesExists ? 'Instalado' : 'NO INSTALADO'}`, null, true);

      // Verificar scripts de package.json
      const requiredScripts = ['start', 'dev', 'build', 'migrate'];
      const missingScripts = requiredScripts.filter(script => !packageJson.scripts?.[script]);

      this.addResult('dependencies', 'scripts', missingScripts.length === 0 ? 'PASS' : 'WARNING',
        missingScripts.length === 0 ? 'Scripts npm configurados' : `Scripts faltantes: ${missingScripts.join(', ')}`,
        null, false);

    } catch (error) {
      this.addResult('dependencies', 'package-json', 'FAIL', `Error leyendo package.json: ${error.message}`, null, true);
    }
  }

  /**
   * Validar configuración de entorno
   */
  async validateEnvironmentConfig(): Promise<void> {
    this.logSection('⚙️ CONFIGURACIÓN DE ENTORNO');

    // Verificar template de producción
    const prodTemplateExists = fs.existsSync(path.join(this.projectRoot, '.env.production.template'));
    this.addResult('environment', 'template', prodTemplateExists ? 'PASS' : 'FAIL',
      `.env.production.template: ${prodTemplateExists ? 'Existe' : 'FALTANTE'}`, null, true);

    if (prodTemplateExists) {
      try {
        const templateContent = fs.readFileSync(path.join(this.projectRoot, '.env.production.template'), 'utf8');

        // Variables críticas que deben estar en el template
        const criticalVars = [
          'NODE_ENV', 'DB_HOST', 'DB_PASSWORD', 'JWT_SECRET', 'STRIPE_SECRET_KEY',
          'OPENAI_API_KEY', 'REDIS_PASSWORD', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'
        ];

        const missingVars = criticalVars.filter(varName => !templateContent.includes(varName));

        this.addResult('environment', 'variables', missingVars.length === 0 ? 'PASS' : 'FAIL',
          missingVars.length === 0 ? 'Variables críticas en template' : `Variables faltantes: ${missingVars.join(', ')}`,
          null, true);

        // Verificar que no hay valores reales en el template
        const hasRealValues = templateContent.includes('sk_live_') || templateContent.includes('sk_test_') ||
                             templateContent.match(/password.*[^_here]/i);

        this.addResult('environment', 'security', !hasRealValues ? 'PASS' : 'WARNING',
          hasRealValues ? 'ADVERTENCIA: Template contiene valores reales' : 'Template sin valores reales',
          null, false);

      } catch (error) {
        this.addResult('environment', 'template-read', 'FAIL', `Error leyendo template: ${error.message}`, null, true);
      }
    }

    // Verificar variables de Docker
    const dockerComposeExists = fs.existsSync(path.join(this.projectRoot, 'docker-compose.production.yml'));
    if (dockerComposeExists) {
      try {
        const dockerContent = fs.readFileSync(path.join(this.projectRoot, 'docker-compose.production.yml'), 'utf8');
        const hasEnvFile = dockerContent.includes('env_file') || dockerContent.includes('.env.production');

        this.addResult('environment', 'docker-env', hasEnvFile ? 'PASS' : 'WARNING',
          hasEnvFile ? 'Docker configurado para usar .env.production' : 'Docker sin configuración de entorno',
          null, false);
      } catch (error) {
        this.addResult('environment', 'docker-read', 'FAIL', `Error leyendo docker-compose: ${error.message}`, null, false);
      }
    }
  }

  /**
   * Validar configuración de base de datos
   */
  async validateDatabaseSetup(): Promise<void> {
    this.logSection('🗄️ BASE DE DATOS');

    // Verificar migraciones
    const migrationsDir = path.join(this.projectRoot, 'database/migrations');
    const migrationsExist = fs.existsSync(migrationsDir);

    this.addResult('database', 'migrations-dir', migrationsExist ? 'PASS' : 'FAIL',
      `Directorio migraciones: ${migrationsExist ? 'Existe' : 'FALTANTE'}`, null, true);

    if (migrationsExist) {
      const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.ts'));

      this.addResult('database', 'migration-files', migrationFiles.length > 0 ? 'PASS' : 'FAIL',
        `Archivos de migración: ${migrationFiles.length}`, null, true);

      // Verificar migraciones específicas críticas
      const criticalMigrations = [
        '20250101000000-implement-multi-tenant-schema.ts',
        '20250101000001-create-tenants-table.ts'
      ];

      const hasCriticalMigrations = criticalMigrations.every(migration =>
        migrationFiles.includes(migration)
      );

      this.addResult('database', 'critical-migrations', hasCriticalMigrations ? 'PASS' : 'FAIL',
        `Migraciones multi-tenant: ${hasCriticalMigrations ? 'Presentes' : 'FALTANTES'}`, null, true);
    }

    // Verificar modelos
    const modelsChecks = [
      'models/Media.ts',
      'models/LeadSource.ts'
    ];

    let modelsPresent = 0;
    modelsChecks.forEach(model => {
      if (fs.existsSync(path.join(this.projectRoot, model))) {
        modelsPresent++;
      }
    });

    this.addResult('database', 'models', modelsPresent >= modelsChecks.length * 0.8 ? 'PASS' : 'WARNING',
      `Modelos implementados: ${modelsPresent}/${modelsChecks.length}`, null, false);
  }

  /**
   * Validar sistema multi-tenant
   */
  async validateMultiTenant(): Promise<void> {
    this.logSection('🏢 SISTEMA MULTI-TENANT');

    // TenantManager
    const tenantManagerExists = fs.existsSync(path.join(this.projectRoot, 'helpers/TenantManager.ts'));
    this.addResult('multi-tenant', 'tenant-manager', tenantManagerExists ? 'PASS' : 'FAIL',
      `TenantManager: ${tenantManagerExists ? 'Implementado' : 'FALTANTE'}`, null, true);

    if (tenantManagerExists) {
      try {
        const tenantManagerContent = fs.readFileSync(path.join(this.projectRoot, 'helpers/TenantManager.ts'), 'utf8');

        const requiredMethods = [
          'getTenantByIdentifier', 'createTenant', 'setSearchPath',
          'resetSearchPath', 'schemaExists', 'getActiveTenants'
        ];

        const hasMethods = requiredMethods.every(method => tenantManagerContent.includes(method));

        this.addResult('multi-tenant', 'tenant-methods', hasMethods ? 'PASS' : 'FAIL',
          `Métodos TenantManager: ${hasMethods ? 'Completos' : 'INCOMPLETOS'}`, null, true);
      } catch (error) {
        this.addResult('multi-tenant', 'tenant-content', 'FAIL', `Error leyendo TenantManager: ${error.message}`, null, true);
      }
    }

    // Middleware
    const middlewareExists = fs.existsSync(path.join(this.projectRoot, 'middleware/tenantMiddleware.ts'));
    this.addResult('multi-tenant', 'middleware', middlewareExists ? 'PASS' : 'FAIL',
      `Tenant Middleware: ${middlewareExists ? 'Implementado' : 'FALTANTE'}`, null, true);

    // Script de validación
    const validationScriptExists = fs.existsSync(path.join(this.projectRoot, 'scripts/validate-multi-tenant.ts'));
    this.addResult('multi-tenant', 'validation-script', validationScriptExists ? 'PASS' : 'WARNING',
      `Script validación: ${validationScriptExists ? 'Presente' : 'FALTANTE'}`, null, false);

    // Documentación
    const docsExist = fs.existsSync(path.join(this.projectRoot, 'docs/MULTI-TENANT.md'));
    this.addResult('multi-tenant', 'documentation', docsExist ? 'PASS' : 'WARNING',
      `Documentación: ${docsExist ? 'Completa' : 'FALTANTE'}`, null, false);
  }

  /**
   * Validar infraestructura
   */
  async validateInfrastructure(): Promise<void> {
    this.logSection('🐳 INFRAESTRUCTURA');

    // Docker Compose
    const dockerFiles = [
      'docker-compose.yml',
      'docker-compose.production.yml'
    ];

    dockerFiles.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult('infrastructure', 'docker-compose', exists ? 'PASS' : 'FAIL',
        `${file}: ${exists ? 'Presente' : 'FALTANTE'}`, null, file.includes('production'));
    });

    // Dockerfile para servicios
    const dockerfileChecks = [
      'audit-service/Dockerfile',
      'nginx/Dockerfile'
    ];

    let dockerfilesPresent = 0;
    dockerfileChecks.forEach(dockerfile => {
      if (fs.existsSync(path.join(this.projectRoot, dockerfile))) {
        dockerfilesPresent++;
      }
    });

    this.addResult('infrastructure', 'dockerfiles', dockerfilesPresent > 0 ? 'PASS' : 'WARNING',
      `Dockerfiles: ${dockerfilesPresent}/${dockerfileChecks.length}`, null, false);

    // Scripts de deployment
    const deployScriptExists = fs.existsSync(path.join(this.projectRoot, 'scripts/deploy-production.sh'));
    this.addResult('infrastructure', 'deploy-script', deployScriptExists ? 'PASS' : 'WARNING',
      `Script deployment: ${deployScriptExists ? 'Presente' : 'FALTANTE'}`, null, false);

    // Verificar que el docker-compose de producción tenga servicios críticos
    const prodComposeExists = fs.existsSync(path.join(this.projectRoot, 'docker-compose.production.yml'));
    if (prodComposeExists) {
      try {
        const composeContent = fs.readFileSync(path.join(this.projectRoot, 'docker-compose.production.yml'), 'utf8');

        const requiredServices = ['app', 'postgres', 'redis', 'nginx', 'prometheus', 'grafana'];
        const hasServices = requiredServices.filter(service => composeContent.includes(`${service}:`));

        this.addResult('infrastructure', 'docker-services', hasServices.length >= 4 ? 'PASS' : 'WARNING',
          `Servicios Docker: ${hasServices.length}/${requiredServices.length}`, hasServices, false);
      } catch (error) {
        this.addResult('infrastructure', 'docker-parse', 'WARNING', `Error parseando docker-compose: ${error.message}`, null, false);
      }
    }
  }

  /**
   * Validar monitoreo
   */
  async validateMonitoring(): Promise<void> {
    this.logSection('📊 MONITOREO Y OBSERVABILIDAD');

    // Archivos de configuración de monitoreo
    const monitoringFiles = [
      'monitoring/prometheus.yml',
      'monitoring/alerts.yml',
      'monitoring/alertmanager.yml'
    ];

    monitoringFiles.forEach(file => {
      const exists = fs.existsSync(path.join(this.projectRoot, file));
      this.addResult('monitoring', 'config-files', exists ? 'PASS' : 'FAIL',
        `${file}: ${exists ? 'Configurado' : 'FALTANTE'}`, null, true);
    });

    // Health checks
    const healthRoutesExist = fs.existsSync(path.join(this.projectRoot, 'src/routes/healthRoutes.ts'));
    this.addResult('monitoring', 'health-checks', healthRoutesExist ? 'PASS' : 'FAIL',
      `Health endpoints: ${healthRoutesExist ? 'Implementados' : 'FALTANTES'}`, null, true);

    // Verificar alertas en prometheus
    const alertsFile = path.join(this.projectRoot, 'monitoring/alerts.yml');
    if (fs.existsSync(alertsFile)) {
      try {
        const alertsContent = fs.readFileSync(alertsFile, 'utf8');
        const alertCount = (alertsContent.match(/- alert:/g) || []).length;

        this.addResult('monitoring', 'alert-rules', alertCount >= 10 ? 'PASS' : 'WARNING',
          `Reglas de alertas: ${alertCount}`, null, false);
      } catch (error) {
        this.addResult('monitoring', 'alerts-parse', 'WARNING', `Error parseando alertas: ${error.message}`, null, false);
      }
    }

    // Grafana dashboards
    const grafanaDir = path.join(this.projectRoot, 'monitoring/grafana');
    const grafanaExists = fs.existsSync(grafanaDir);
    this.addResult('monitoring', 'grafana', grafanaExists ? 'PASS' : 'WARNING',
      `Configuración Grafana: ${grafanaExists ? 'Presente' : 'FALTANTE'}`, null, false);
  }

  /**
   * Validar seguridad
   */
  async validateSecurity(): Promise<void> {
    this.logSection('🔒 SEGURIDAD');

    // Verificar que existen servicios de seguridad
    const securityServices = [
      'middleware/tenantMiddleware.ts'
    ];

    securityServices.forEach(service => {
      const exists = fs.existsSync(path.join(this.projectRoot, service));
      this.addResult('security', 'services', exists ? 'PASS' : 'WARNING',
        `${service}: ${exists ? 'Implementado' : 'FALTANTE'}`, null, false);
    });

    // Verificar que no hay secretos en archivos
    const filesToCheck = [
      '.env.production.template',
      'docker-compose.production.yml'
    ];

    filesToCheck.forEach(file => {
      const filePath = path.join(this.projectRoot, file);
      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const hasSecrets = content.includes('sk_live_') || content.includes('password123') ||
                            content.match(/[a-zA-Z0-9]{32,}/g)?.some(match => !match.includes('_'));

          this.addResult('security', 'no-secrets', !hasSecrets ? 'PASS' : 'FAIL',
            `${file}: ${hasSecrets ? 'CONTIENE SECRETOS' : 'Sin secretos expuestos'}`, null, hasSecrets);
        } catch (error) {
          this.addResult('security', 'secret-check', 'WARNING', `Error verificando ${file}: ${error.message}`, null, false);
        }
      }
    });

    // Verificar HTTPS en producción
    const prodCompose = path.join(this.projectRoot, 'docker-compose.production.yml');
    if (fs.existsSync(prodCompose)) {
      try {
        const content = fs.readFileSync(prodCompose, 'utf8');
        const hasSSL = content.includes('443:443') || content.includes('ssl') || content.includes('https');

        this.addResult('security', 'https', hasSSL ? 'PASS' : 'WARNING',
          `HTTPS configurado: ${hasSSL ? 'Sí' : 'No detectado'}`, null, false);
      } catch (error) {
        this.addResult('security', 'https-check', 'WARNING', `Error verificando HTTPS: ${error.message}`, null, false);
      }
    }
  }

  /**
   * Validar rendimiento
   */
  async validatePerformance(): Promise<void> {
    this.logSection('⚡ RENDIMIENTO');

    // Verificar configuraciones de performance en docker-compose
    const prodCompose = path.join(this.projectRoot, 'docker-compose.production.yml');
    if (fs.existsSync(prodCompose)) {
      try {
        const content = fs.readFileSync(prodCompose, 'utf8');

        const hasResourceLimits = content.includes('cpus:') && content.includes('memory:');
        const hasHealthChecks = content.includes('healthcheck:');
        const hasReplicas = content.includes('replicas:');

        this.addResult('performance', 'resource-limits', hasResourceLimits ? 'PASS' : 'WARNING',
          `Resource limits: ${hasResourceLimits ? 'Configurados' : 'No configurados'}`, null, false);

        this.addResult('performance', 'health-checks', hasHealthChecks ? 'PASS' : 'WARNING',
          `Health checks: ${hasHealthChecks ? 'Configurados' : 'No configurados'}`, null, false);

        this.addResult('performance', 'scaling', hasReplicas ? 'PASS' : 'WARNING',
          `Scaling: ${hasReplicas ? 'Configurado' : 'No configurado'}`, null, false);

      } catch (error) {
        this.addResult('performance', 'docker-performance', 'WARNING', `Error verificando performance: ${error.message}`, null, false);
      }
    }

    // Verificar configuración de Redis y PostgreSQL
    const hasRedisConfig = fs.existsSync(path.join(this.projectRoot, 'redis/redis.conf'));
    const hasPostgresConfig = fs.existsSync(path.join(this.projectRoot, 'postgresql/postgresql.conf'));

    this.addResult('performance', 'database-config', hasRedisConfig || hasPostgresConfig ? 'PASS' : 'WARNING',
      `Configuración DB: ${hasRedisConfig ? 'Redis ✓' : ''} ${hasPostgresConfig ? 'PostgreSQL ✓' : ''}`.trim() || 'No optimizada',
      null, false);
  }

  /**
   * Validar documentación
   */
  async validateDocumentation(): Promise<void> {
    this.logSection('📚 DOCUMENTACIÓN');

    const docFiles = [
      'ROADMAP.md',
      'docs/INFRASTRUCTURE.md',
      'docs/MULTI-TENANT.md'
    ];

    docFiles.forEach(doc => {
      const exists = fs.existsSync(path.join(this.projectRoot, doc));
      this.addResult('documentation', 'files', exists ? 'PASS' : 'WARNING',
        `${doc}: ${exists ? 'Presente' : 'FALTANTE'}`, null, doc === 'ROADMAP.md');
    });

    // Verificar que el ROADMAP esté actualizado
    const roadmapPath = path.join(this.projectRoot, 'ROADMAP.md');
    if (fs.existsSync(roadmapPath)) {
      try {
        const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');
        const isCompleted = roadmapContent.includes('100% COMPLETADO');

        this.addResult('documentation', 'roadmap-status', isCompleted ? 'PASS' : 'WARNING',
          `ROADMAP: ${isCompleted ? 'Marcado como completado' : 'No marcado como completado'}`, null, false);
      } catch (error) {
        this.addResult('documentation', 'roadmap-read', 'WARNING', `Error leyendo ROADMAP: ${error.message}`, null, false);
      }
    }
  }

  /**
   * Generar reporte final
   */
  generateReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📋 REPORTE FINAL DE VALIDACIÓN PRE-DEPLOY');
    console.log('='.repeat(80));

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

    // Determinar estado de deploy
    console.log('\n' + '='.repeat(80));
    if (critical === 0 && failed <= 2) {
      console.log('🚀 ESTADO: ✅ LISTO PARA DEPLOY');
      console.log('   El sistema cumple con los requisitos mínimos para producción');
    } else if (critical === 0) {
      console.log('🚀 ESTADO: ⚠️  DEPLOY CON PRECAUCIÓN');
      console.log('   El sistema es funcional pero tiene elementos por mejorar');
    } else {
      console.log('🚀 ESTADO: ❌ NO LISTO PARA DEPLOY');
      console.log('   Se requieren correcciones críticas antes del deploy');
    }

    // Detalles por categoría
    console.log('\n📋 DETALLES POR CATEGORÍA:\n');

    const categories = this.groupByCategory();
    Object.entries(categories).forEach(([category, results]) => {
      const categoryPassed = results.filter(r => r.status === 'PASS').length;
      const categoryTotal = results.length;
      const categoryPercent = Math.round((categoryPassed / categoryTotal) * 100);

      console.log(`${this.getCategoryIcon(category)} ${category.toUpperCase()} (${categoryPercent}%)`);

      results.forEach(result => {
        const icon = this.getStatusIcon(result.status);
        console.log(`   ${icon} ${result.message}`);
      });
      console.log('');
    });

    // Elementos críticos que fallan
    const criticalFailures = this.results.filter(r => r.status === 'FAIL' && r.critical);
    if (criticalFailures.length > 0) {
      console.log('🚨 ELEMENTOS CRÍTICOS A CORREGIR:');
      criticalFailures.forEach(failure => {
        console.log(`   ❌ ${failure.category}: ${failure.message}`);
      });
      console.log('');
    }

    // Recomendaciones finales
    console.log('🔧 RECOMENDACIONES PARA DEPLOY:\n');

    if (critical > 0) {
      console.log('🚨 URGENTE:');
      console.log('   1. Corregir todos los fallos críticos listados arriba');
      console.log('   2. Re-ejecutar validación hasta obtener 0 fallos críticos');
      console.log('   3. Verificar manualmente la configuración de base de datos');
    } else {
      console.log('✅ PRE-DEPLOY CHECKLIST:');
      console.log('   1. Configurar variables de entorno de producción (.env.production)');
      console.log('   2. Verificar secretos y credenciales');
      console.log('   3. Ejecutar migraciones de base de datos');
      console.log('   4. Configurar monitoreo y alertas');
      console.log('   5. Preparar plan de rollback');
      console.log('   6. Ejecutar: ./scripts/deploy-production.sh');
    }

    console.log('\n🎉 SISTEMA CHATEAM v1.0.0 - VALIDACIÓN COMPLETADA');
    console.log('='.repeat(80) + '\n');
  }

  /**
   * Helpers
   */
  private addResult(category: string, check: string, status: 'PASS' | 'FAIL' | 'WARNING' | 'SKIP',
                   message: string, details: any = null, critical: boolean = false): void {
    this.results.push({ category, check, status, message, details, critical });

    const icon = this.getStatusIcon(status);
    console.log(`${icon} ${message}`);
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'PASS': return '✅';
      case 'FAIL': return '❌';
      case 'WARNING': return '⚠️';
      case 'SKIP': return '⏭️';
      default: return '❓';
    }
  }

  private getCategoryIcon(category: string): string {
    const icons = {
      'structure': '📁',
      'dependencies': '📦',
      'environment': '⚙️',
      'database': '🗄️',
      'multi-tenant': '🏢',
      'infrastructure': '🐳',
      'monitoring': '📊',
      'security': '🔒',
      'performance': '⚡',
      'documentation': '📚'
    };
    return icons[category] || '📋';
  }

  private groupByCategory(): Record<string, ValidationResult[]> {
    return this.results.reduce((acc, result) => {
      if (!acc[result.category]) {
        acc[result.category] = [];
      }
      acc[result.category].push(result);
      return acc;
    }, {} as Record<string, ValidationResult[]>);
  }

  private logSection(title: string): void {
    console.log(`\n${title}`);
    console.log('-'.repeat(title.length));
  }
}

// Ejecutar validación si es llamado directamente
if (require.main === module) {
  (async () => {
    const validator = new PreDeployValidator();

    try {
      await validator.validate();
      validator.generateReport();

      // Exit con código apropiado
      const criticalFailures = validator.results.filter(r => r.status === 'FAIL' && r.critical).length;
      process.exit(criticalFailures > 0 ? 1 : 0);

    } catch (error) {
      console.error('❌ Error durante la validación:', error);
      process.exit(1);
    }
  })();
}

export default PreDeployValidator;