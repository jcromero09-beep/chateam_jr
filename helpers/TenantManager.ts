import sequelize from '../database';
import { QueryTypes } from 'sequelize';

interface Tenant {
  id: number;
  name: string;
  subdomain: string;
  schema_name: string;
  status: 'active' | 'inactive' | 'suspended';
  database_config?: any;
  settings?: any;
  created_at: Date;
  updated_at: Date;
}

interface TenantCreateData {
  name: string;
  subdomain: string;
  settings?: any;
}

/**
 * Gestor centralizado para operaciones multi-tenant
 */
export class TenantManager {
  private static currentSchemaPath: string = 'public';

  /**
   * Obtiene un tenant por su identificador (subdomain, id, o schema_name)
   */
  static async getTenantByIdentifier(identifier: string): Promise<Tenant | null> {
    try {
      // Asegurar que estamos en el esquema public para consultas de tenants
      await this.resetSearchPath();

      const query = `
        SELECT * FROM tenants
        WHERE subdomain = :identifier
           OR schema_name = :identifier
           OR id = :identifier
        LIMIT 1
      `;

      const results = await sequelize.query(query, {
        replacements: { identifier },
        type: QueryTypes.SELECT,
      }) as Tenant[];

      return results.length > 0 ? results[0] : null;
    } catch (error) {
      console.error('Error getting tenant:', error);
      return null;
    }
  }

  /**
   * Obtiene todos los tenants activos
   */
  static async getActiveTenants(): Promise<Tenant[]> {
    try {
      await this.resetSearchPath();

      const query = `
        SELECT * FROM tenants
        WHERE status = 'active'
        ORDER BY name ASC
      `;

      return await sequelize.query(query, {
        type: QueryTypes.SELECT,
      }) as Tenant[];
    } catch (error) {
      console.error('Error getting active tenants:', error);
      return [];
    }
  }

  /**
   * Crea un nuevo tenant
   */
  static async createTenant(data: TenantCreateData): Promise<Tenant | null> {
    const transaction = await sequelize.transaction();

    try {
      await this.resetSearchPath();

      // Generar schema name único
      const schemaName = `tenant_${data.subdomain.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      // Verificar que el subdomain no existe
      const existing = await this.getTenantByIdentifier(data.subdomain);
      if (existing) {
        throw new Error(`Tenant with subdomain '${data.subdomain}' already exists`);
      }

      // Crear registro del tenant
      const insertQuery = `
        INSERT INTO tenants (name, subdomain, schema_name, status, settings, created_at, updated_at)
        VALUES (:name, :subdomain, :schemaName, 'active', :settings, NOW(), NOW())
        RETURNING *
      `;

      const [tenant] = await sequelize.query(insertQuery, {
        replacements: {
          name: data.name,
          subdomain: data.subdomain,
          schemaName,
          settings: JSON.stringify(data.settings || {}),
        },
        type: QueryTypes.SELECT,
        transaction,
      }) as Tenant[];

      // El trigger se encargará de crear el esquema automáticamente
      await transaction.commit();

      console.log(`✅ Tenant created: ${tenant.name} (${tenant.schema_name})`);
      return tenant;
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating tenant:', error);
      return null;
    }
  }

  /**
   * Actualiza un tenant
   */
  static async updateTenant(id: number, data: Partial<TenantCreateData>): Promise<boolean> {
    try {
      await this.resetSearchPath();

      const updateFields = [];
      const replacements: any = { id };

      if (data.name) {
        updateFields.push('name = :name');
        replacements.name = data.name;
      }

      if (data.settings) {
        updateFields.push('settings = :settings');
        replacements.settings = JSON.stringify(data.settings);
      }

      if (updateFields.length === 0) {
        return false;
      }

      updateFields.push('updated_at = NOW()');

      const query = `
        UPDATE tenants
        SET ${updateFields.join(', ')}
        WHERE id = :id
      `;

      const [, affectedRows] = await sequelize.query(query, {
        replacements,
        type: QueryTypes.UPDATE,
      });

      return affectedRows > 0;
    } catch (error) {
      console.error('Error updating tenant:', error);
      return false;
    }
  }

  /**
   * Desactiva un tenant (soft delete)
   */
  static async deactivateTenant(id: number): Promise<boolean> {
    try {
      await this.resetSearchPath();

      const query = `
        UPDATE tenants
        SET status = 'inactive', updated_at = NOW()
        WHERE id = :id
      `;

      const [, affectedRows] = await sequelize.query(query, {
        replacements: { id },
        type: QueryTypes.UPDATE,
      });

      return affectedRows > 0;
    } catch (error) {
      console.error('Error deactivating tenant:', error);
      return false;
    }
  }

  /**
   * Elimina un tenant y su esquema (hard delete)
   */
  static async deleteTenant(id: number): Promise<boolean> {
    const transaction = await sequelize.transaction();

    try {
      await this.resetSearchPath();

      // Obtener info del tenant
      const tenant = await this.getTenantByIdentifier(id.toString());
      if (!tenant) {
        return false;
      }

      // Eliminar esquema
      await sequelize.query(`DROP SCHEMA IF EXISTS "${tenant.schema_name}" CASCADE`, {
        transaction
      });

      // Eliminar registro
      await sequelize.query('DELETE FROM tenants WHERE id = :id', {
        replacements: { id },
        type: QueryTypes.DELETE,
        transaction,
      });

      await transaction.commit();
      console.log(`✅ Tenant deleted: ${tenant.name} (${tenant.schema_name})`);
      return true;
    } catch (error) {
      await transaction.rollback();
      console.error('Error deleting tenant:', error);
      return false;
    }
  }

  /**
   * Configura el search_path para un tenant específico
   */
  static async setSearchPath(schemaName: string): Promise<void> {
    try {
      await sequelize.query(`SET search_path TO "${schemaName}", public`);
      this.currentSchemaPath = schemaName;
    } catch (error) {
      console.error(`Error setting search path to ${schemaName}:`, error);
      throw error;
    }
  }

  /**
   * Resetea el search_path al esquema public
   */
  static async resetSearchPath(): Promise<void> {
    try {
      await sequelize.query('SET search_path TO public');
      this.currentSchemaPath = 'public';
    } catch (error) {
      console.error('Error resetting search path:', error);
      throw error;
    }
  }

  /**
   * Obtiene el search_path actual
   */
  static getCurrentSchemaPath(): string {
    return this.currentSchemaPath;
  }

  /**
   * Verifica si un esquema existe
   */
  static async schemaExists(schemaName: string): Promise<boolean> {
    try {
      const query = `
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = :schemaName
      `;

      const results = await sequelize.query(query, {
        replacements: { schemaName },
        type: QueryTypes.SELECT,
      });

      return results.length > 0;
    } catch (error) {
      console.error('Error checking schema existence:', error);
      return false;
    }
  }

  /**
   * Migra datos de un tenant (útil para actualizaciones de esquema)
   */
  static async migrateTenantData(tenantId: number, migrationFn: (schemaName: string) => Promise<void>): Promise<boolean> {
    try {
      const tenant = await this.getTenantByIdentifier(tenantId.toString());
      if (!tenant) {
        return false;
      }

      await this.setSearchPath(tenant.schema_name);
      await migrationFn(tenant.schema_name);
      await this.resetSearchPath();

      console.log(`✅ Migration completed for tenant: ${tenant.name}`);
      return true;
    } catch (error) {
      console.error(`Error migrating tenant ${tenantId}:`, error);
      await this.resetSearchPath();
      return false;
    }
  }

  /**
   * Obtiene estadísticas de uso de un tenant
   */
  static async getTenantStats(tenantId: number): Promise<any> {
    try {
      const tenant = await this.getTenantByIdentifier(tenantId.toString());
      if (!tenant) {
        return null;
      }

      await this.setSearchPath(tenant.schema_name);

      const stats = {
        users: 0,
        tickets: 0,
        messages: 0,
        campaigns: 0,
        contacts: 0,
        storage_used_mb: 0,
      };

      // Contar registros principales (ajustar según tablas reales)
      try {
        const [usersResult] = await sequelize.query('SELECT COUNT(*) as count FROM users', { type: QueryTypes.SELECT }) as any[];
        stats.users = parseInt(usersResult.count);
      } catch (e) { /* tabla puede no existir */ }

      try {
        const [ticketsResult] = await sequelize.query('SELECT COUNT(*) as count FROM tickets', { type: QueryTypes.SELECT }) as any[];
        stats.tickets = parseInt(ticketsResult.count);
      } catch (e) { /* tabla puede no existir */ }

      try {
        const [messagesResult] = await sequelize.query('SELECT COUNT(*) as count FROM messages', { type: QueryTypes.SELECT }) as any[];
        stats.messages = parseInt(messagesResult.count);
      } catch (e) { /* tabla puede no existir */ }

      await this.resetSearchPath();
      return stats;
    } catch (error) {
      console.error('Error getting tenant stats:', error);
      await this.resetSearchPath();
      return null;
    }
  }
}

export default TenantManager;