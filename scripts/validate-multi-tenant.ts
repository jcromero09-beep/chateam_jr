#!/usr/bin/env ts-node

/**
 * SCRIPT DE VALIDACIÓN MULTI-TENANT
 * Verifica que el sistema multi-tenant con schema-per-tenant esté correctamente implementado
 */

import { QueryInterface, QueryTypes, Sequelize } from 'sequelize';
import { TenantManager } from '../helpers/TenantManager';

interface ValidationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message: string;
  details?: any;
}

class MultiTenantValidator {
  private sequelize: Sequelize;
  private results: ValidationResult[] = [];

  constructor() {
    this.sequelize = new Sequelize({
      dialect: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'chateam_dev',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      logging: false,
    });
  }

  /**
   * Ejecuta todas las validaciones
   */
  async validate(): Promise<ValidationResult[]> {
    console.log('🔍 Iniciando validación del sistema multi-tenant...\n');

    await this.checkDatabaseConnection();
    await this.checkTenantsTable();
    await this.checkTenantManagerClass();
    await this.checkTenantMiddleware();
    await this.checkSchemaIsolation();
    await this.checkTenantOperations();
    await this.checkDataIsolation();
    await this.checkPerformance();

    return this.results;
  }

  /**
   * Verifica la conexión a la base de datos
   */
  async checkDatabaseConnection(): Promise<void> {
    try {
      await this.sequelize.authenticate();
      this.addResult('database-connection', 'PASS', 'Conexión a PostgreSQL exitosa');
    } catch (error) {
      this.addResult('database-connection', 'FAIL', `Error de conexión: ${error.message}`);
    }
  }

  /**
   * Verifica que la tabla tenants existe y tiene la estructura correcta
   */
  async checkTenantsTable(): Promise<void> {
    try {
      const tableExists = await this.sequelize.getQueryInterface().showAllTables();

      if (!tableExists.includes('tenants')) {
        this.addResult('tenants-table', 'FAIL', 'Tabla "tenants" no existe');
        return;
      }

      // Verificar estructura de la tabla
      const tableDescription = await this.sequelize.getQueryInterface().describeTable('tenants');

      const requiredColumns = ['id', 'name', 'subdomain', 'schema_name', 'status', 'settings'];
      const missingColumns = requiredColumns.filter(col => !tableDescription[col]);

      if (missingColumns.length > 0) {
        this.addResult('tenants-table', 'FAIL', `Columnas faltantes: ${missingColumns.join(', ')}`);
        return;
      }

      // Verificar constraints únicos
      const indexes = await this.sequelize.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'tenants' AND indexdef LIKE '%UNIQUE%'
      `, { type: QueryTypes.SELECT });

      const hasSubdomainUnique = indexes.some((idx: any) => idx.indexdef.includes('subdomain'));
      const hasSchemaUnique = indexes.some((idx: any) => idx.indexdef.includes('schema_name'));

      if (!hasSubdomainUnique || !hasSchemaUnique) {
        this.addResult('tenants-table', 'WARNING', 'Constraints únicos faltantes en subdomain o schema_name');
      } else {
        this.addResult('tenants-table', 'PASS', 'Tabla tenants correctamente estructurada');
      }

      // Verificar triggers
      const triggers = await this.sequelize.query(`
        SELECT trigger_name, event_manipulation, action_timing
        FROM information_schema.triggers
        WHERE event_object_table = 'tenants'
      `, { type: QueryTypes.SELECT });

      const hasCreateTrigger = triggers.some((t: any) => t.trigger_name.includes('schema'));
      if (!hasCreateTrigger) {
        this.addResult('tenants-triggers', 'WARNING', 'Triggers de esquema no encontrados');
      } else {
        this.addResult('tenants-triggers', 'PASS', 'Triggers de esquema configurados');
      }

    } catch (error) {
      this.addResult('tenants-table', 'FAIL', `Error verificando tabla: ${error.message}`);
    }
  }

  /**
   * Verifica que la clase TenantManager está implementada correctamente
   */
  async checkTenantManagerClass(): Promise<void> {
    try {
      // Verificar métodos esenciales
      const methods = [
        'getTenantByIdentifier',
        'getActiveTenants',
        'createTenant',
        'setSearchPath',
        'resetSearchPath',
        'schemaExists'
      ];

      const missingMethods = methods.filter(method => typeof TenantManager[method] !== 'function');

      if (missingMethods.length > 0) {
        this.addResult('tenant-manager', 'FAIL', `Métodos faltantes: ${missingMethods.join(', ')}`);
        return;
      }

      // Test básico de funcionalidad
      const currentPath = TenantManager.getCurrentSchemaPath();
      await TenantManager.resetSearchPath();

      this.addResult('tenant-manager', 'PASS', 'TenantManager correctamente implementado');

    } catch (error) {
      this.addResult('tenant-manager', 'FAIL', `Error en TenantManager: ${error.message}`);
    }
  }

  /**
   * Verifica que el middleware de tenant está configurado
   */
  async checkTenantMiddleware(): Promise<void> {
    try {
      // Verificar que el archivo de middleware existe
      const fs = require('fs');
      const middlewarePath = './middleware/tenantMiddleware.ts';

      if (!fs.existsSync(middlewarePath)) {
        this.addResult('tenant-middleware', 'FAIL', 'Archivo tenantMiddleware.ts no encontrado');
        return;
      }

      const middlewareContent = fs.readFileSync(middlewarePath, 'utf8');

      // Verificar funciones clave
      const requiredFunctions = [
        'tenantMiddleware',
        'requireTenant',
        'checkTenantPermissions',
        'cleanupTenantContext'
      ];

      const missingFunctions = requiredFunctions.filter(fn => !middlewareContent.includes(fn));

      if (missingFunctions.length > 0) {
        this.addResult('tenant-middleware', 'FAIL', `Funciones faltantes: ${missingFunctions.join(', ')}`);
        return;
      }

      this.addResult('tenant-middleware', 'PASS', 'Middleware de tenant correctamente implementado');

    } catch (error) {
      this.addResult('tenant-middleware', 'FAIL', `Error verificando middleware: ${error.message}`);
    }
  }

  /**
   * Verifica el aislamiento por esquemas
   */
  async checkSchemaIsolation(): Promise<void> {
    try {
      // Obtener esquemas existentes
      const schemas = await this.sequelize.query(`
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name LIKE 'tenant_%'
      `, { type: QueryTypes.SELECT }) as any[];

      if (schemas.length === 0) {
        this.addResult('schema-isolation', 'WARNING', 'No se encontraron esquemas de tenant');
        return;
      }

      // Verificar que cada esquema tiene sus propias tablas
      let allSchemasValid = true;
      for (const schema of schemas) {
        const tables = await this.sequelize.query(`
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = '${schema.schema_name}'
        `, { type: QueryTypes.SELECT });

        if (tables.length === 0) {
          allSchemasValid = false;
          break;
        }
      }

      if (allSchemasValid) {
        this.addResult('schema-isolation', 'PASS', `${schemas.length} esquemas de tenant con tablas válidas`);
      } else {
        this.addResult('schema-isolation', 'WARNING', 'Algunos esquemas de tenant están vacíos');
      }

    } catch (error) {
      this.addResult('schema-isolation', 'FAIL', `Error verificando aislamiento: ${error.message}`);
    }
  }

  /**
   * Verifica las operaciones básicas de tenant
   */
  async checkTenantOperations(): Promise<void> {
    try {
      // Test: Obtener tenants activos
      const activeTenants = await TenantManager.getActiveTenants();

      if (activeTenants.length === 0) {
        this.addResult('tenant-operations', 'WARNING', 'No hay tenants activos');
        return;
      }

      // Test: Cambiar search path
      const testTenant = activeTenants[0];
      await TenantManager.setSearchPath(testTenant.schema_name);

      // Verificar search path
      const currentPath = await this.sequelize.query('SHOW search_path', { type: QueryTypes.SELECT }) as any[];
      const searchPath = currentPath[0].search_path;

      await TenantManager.resetSearchPath();

      if (searchPath.includes(testTenant.schema_name)) {
        this.addResult('tenant-operations', 'PASS', 'Operaciones de tenant funcionando correctamente');
      } else {
        this.addResult('tenant-operations', 'FAIL', 'Error al cambiar search_path');
      }

    } catch (error) {
      this.addResult('tenant-operations', 'FAIL', `Error en operaciones: ${error.message}`);
    }
  }

  /**
   * Verifica el aislamiento de datos entre tenants
   */
  async checkDataIsolation(): Promise<void> {
    try {
      const tenants = await TenantManager.getActiveTenants();

      if (tenants.length < 2) {
        this.addResult('data-isolation', 'WARNING', 'Necesitas al menos 2 tenants para verificar aislamiento');
        return;
      }

      // Test: Insertar datos en tenant 1
      const tenant1 = tenants[0];
      const tenant2 = tenants[1];

      await TenantManager.setSearchPath(tenant1.schema_name);

      // Verificar que las tablas existen
      const tables = await this.sequelize.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = '${tenant1.schema_name}' AND table_name = 'users'
      `, { type: QueryTypes.SELECT });

      if (tables.length === 0) {
        this.addResult('data-isolation', 'WARNING', 'Tabla users no encontrada en esquema de tenant');
        await TenantManager.resetSearchPath();
        return;
      }

      // Test insert en tenant 1
      await this.sequelize.query(`
        INSERT INTO users (name, email, password)
        VALUES ('Test User 1', 'test1@tenant1.com', 'password123')
        ON CONFLICT (email) DO NOTHING
      `);

      // Cambiar a tenant 2 y verificar que no ve los datos del tenant 1
      await TenantManager.setSearchPath(tenant2.schema_name);

      const usersInTenant2 = await this.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE email = 'test1@tenant1.com'
      `, { type: QueryTypes.SELECT }) as any[];

      await TenantManager.resetSearchPath();

      if (usersInTenant2[0].count === '0') {
        this.addResult('data-isolation', 'PASS', 'Aislamiento de datos verificado correctamente');
      } else {
        this.addResult('data-isolation', 'FAIL', 'CRÍTICO: Filtración de datos entre tenants');
      }

    } catch (error) {
      await TenantManager.resetSearchPath();
      this.addResult('data-isolation', 'FAIL', `Error verificando aislamiento: ${error.message}`);
    }
  }

  /**
   * Verifica el rendimiento del sistema multi-tenant
   */
  async checkPerformance(): Promise<void> {
    try {
      const startTime = Date.now();

      // Test: Operaciones múltiples de cambio de contexto
      const tenants = await TenantManager.getActiveTenants();

      if (tenants.length === 0) {
        this.addResult('performance', 'WARNING', 'No hay tenants para probar rendimiento');
        return;
      }

      // Simular 10 cambios de contexto
      for (let i = 0; i < 10; i++) {
        const tenant = tenants[i % tenants.length];
        await TenantManager.setSearchPath(tenant.schema_name);
        await this.sequelize.query('SELECT 1', { type: QueryTypes.SELECT });
      }

      await TenantManager.resetSearchPath();

      const endTime = Date.now();
      const duration = endTime - startTime;

      if (duration < 1000) {
        this.addResult('performance', 'PASS', `Rendimiento óptimo: ${duration}ms para 10 operaciones`);
      } else if (duration < 3000) {
        this.addResult('performance', 'WARNING', `Rendimiento aceptable: ${duration}ms para 10 operaciones`);
      } else {
        this.addResult('performance', 'FAIL', `Rendimiento deficiente: ${duration}ms para 10 operaciones`);
      }

    } catch (error) {
      await TenantManager.resetSearchPath();
      this.addResult('performance', 'FAIL', `Error en test de rendimiento: ${error.message}`);
    }
  }

  /**
   * Agrega un resultado de validación
   */
  private addResult(check: string, status: 'PASS' | 'FAIL' | 'WARNING', message: string, details?: any): void {
    this.results.push({ check, status, message, details });

    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${check}: ${message}`);
  }

  /**
   * Genera reporte final
   */
  generateReport(): void {
    console.log('\n📊 REPORTE DE VALIDACIÓN MULTI-TENANT\n');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const warnings = this.results.filter(r => r.status === 'WARNING').length;

    console.log(`✅ Pasaron: ${passed}`);
    console.log(`❌ Fallaron: ${failed}`);
    console.log(`⚠️  Advertencias: ${warnings}`);
    console.log(`📊 Total: ${this.results.length}`);

    const successRate = Math.round((passed / this.results.length) * 100);
    console.log(`🎯 Tasa de éxito: ${successRate}%`);

    console.log('\n' + '='.repeat(60));

    if (failed === 0 && warnings <= 2) {
      console.log('🎉 VALIDACIÓN EXITOSA: Sistema multi-tenant correctamente implementado');
    } else if (failed === 0) {
      console.log('✅ VALIDACIÓN PARCIAL: Sistema funcional con algunas advertencias');
    } else {
      console.log('❌ VALIDACIÓN FALLIDA: Se requieren correcciones críticas');
    }

    console.log('\n📋 DETALLES POR CATEGORÍA:\n');

    // Agrupar por tipo de check
    const categories = {
      'Conectividad': ['database-connection'],
      'Estructura': ['tenants-table', 'tenants-triggers'],
      'Implementación': ['tenant-manager', 'tenant-middleware'],
      'Aislamiento': ['schema-isolation', 'data-isolation'],
      'Operaciones': ['tenant-operations'],
      'Rendimiento': ['performance']
    };

    Object.entries(categories).forEach(([category, checks]) => {
      console.log(`\n${category}:`);
      checks.forEach(checkName => {
        const result = this.results.find(r => r.check === checkName);
        if (result) {
          const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
          console.log(`  ${icon} ${result.message}`);
        }
      });
    });

    // Recomendaciones
    console.log('\n🔧 RECOMENDACIONES:\n');

    const criticalFailures = this.results.filter(r => r.status === 'FAIL');
    if (criticalFailures.length > 0) {
      console.log('🚨 CRÍTICO - Resolver inmediatamente:');
      criticalFailures.forEach(failure => {
        console.log(`   • ${failure.message}`);
      });
      console.log('');
    }

    const warningItems = this.results.filter(r => r.status === 'WARNING');
    if (warningItems.length > 0) {
      console.log('⚠️  MEJORAS - Considerar para optimización:');
      warningItems.forEach(warning => {
        console.log(`   • ${warning.message}`);
      });
      console.log('');
    }

    if (failed === 0 && warnings === 0) {
      console.log('🚀 Sistema multi-tenant enterprise-ready!');
      console.log('   • Aislamiento de datos verificado');
      console.log('   • Rendimiento óptimo');
      console.log('   • Estructura completa');
      console.log('   • Operaciones funcionales');
    }
  }

  /**
   * Cierra la conexión
   */
  async close(): Promise<void> {
    await this.sequelize.close();
  }
}

// Ejecutar validación si es llamado directamente
if (require.main === module) {
  (async () => {
    const validator = new MultiTenantValidator();

    try {
      await validator.validate();
      validator.generateReport();
    } catch (error) {
      console.error('❌ Error durante la validación:', error);
    } finally {
      await validator.close();
    }
  })();
}

export default MultiTenantValidator;