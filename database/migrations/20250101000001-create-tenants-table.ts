import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Crear tabla de tenants en el esquema public
    await queryInterface.createTable("tenants", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: "Nombre de la empresa/tenant"
      },
      subdomain: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: "Subdominio único para el tenant (ej: empresa1)"
      },
      schema_name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        comment: "Nombre del esquema PostgreSQL (ej: tenant_empresa1)"
      },
      status: {
        type: DataTypes.ENUM("active", "inactive", "suspended"),
        allowNull: false,
        defaultValue: "active",
        comment: "Estado del tenant"
      },
      database_config: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Configuración específica de base de datos"
      },
      settings: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Configuraciones del tenant (limits, features, etc.)"
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    // Crear índices para optimización
    await queryInterface.addIndex("tenants", ["subdomain"]);
    await queryInterface.addIndex("tenants", ["schema_name"]);
    await queryInterface.addIndex("tenants", ["status"]);

    // Crear trigger function para crear esquema automáticamente
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION create_tenant_schema()
      RETURNS trigger AS $$
      BEGIN
        -- Crear esquema para el nuevo tenant
        EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', NEW.schema_name);

        -- Crear tablas base en el nuevo esquema
        -- Nota: En un caso real, aquí copiarías toda la estructura de tablas
        -- Para este ejemplo, creamos algunas tablas básicas

        EXECUTE format('
          CREATE TABLE IF NOT EXISTS %I.users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            profile VARCHAR(50) DEFAULT ''user'',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )', NEW.schema_name);

        EXECUTE format('
          CREATE TABLE IF NOT EXISTS %I.tickets (
            id SERIAL PRIMARY KEY,
            status VARCHAR(50) DEFAULT ''open'',
            subject VARCHAR(255),
            user_id INTEGER REFERENCES %I.users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )', NEW.schema_name, NEW.schema_name);

        EXECUTE format('
          CREATE TABLE IF NOT EXISTS %I.messages (
            id SERIAL PRIMARY KEY,
            body TEXT,
            ticket_id INTEGER REFERENCES %I.tickets(id),
            user_id INTEGER REFERENCES %I.users(id),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )', NEW.schema_name, NEW.schema_name, NEW.schema_name);

        EXECUTE format('
          CREATE TABLE IF NOT EXISTS %I.contacts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            number VARCHAR(50),
            email VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )', NEW.schema_name);

        EXECUTE format('
          CREATE TABLE IF NOT EXISTS %I.campaigns (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            status VARCHAR(50) DEFAULT ''draft'',
            platform VARCHAR(50),
            settings JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )', NEW.schema_name);

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Crear trigger para ejecutar la función
    await queryInterface.sequelize.query(`
      CREATE TRIGGER tenant_schema_trigger
        AFTER INSERT ON tenants
        FOR EACH ROW
        EXECUTE FUNCTION create_tenant_schema();
    `);

    // Crear función para limpiar esquema al eliminar tenant
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION cleanup_tenant_schema()
      RETURNS trigger AS $$
      BEGIN
        -- Eliminar esquema del tenant eliminado
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', OLD.schema_name);
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Crear trigger para cleanup
    await queryInterface.sequelize.query(`
      CREATE TRIGGER tenant_cleanup_trigger
        AFTER DELETE ON tenants
        FOR EACH ROW
        EXECUTE FUNCTION cleanup_tenant_schema();
    `);

    // Insertar tenant por defecto si no existe
    await queryInterface.sequelize.query(`
      -- [2026-08-01] created_at/updated_at son NOT NULL y su \`defaultValue:
      -- DataTypes.NOW\` es un default de APLICACIÓN: Sequelize lo rellena al crear
      -- vía modelo, pero este INSERT es SQL crudo y no pasa por ahí. La migración
      -- moría con "null value in column created_at violates not-null constraint".
      -- Se vio al levantar una BD desde cero por primera vez (nadie lo había hecho:
      -- el runner de migraciones estaba roto).
      INSERT INTO tenants (name, subdomain, schema_name, status, settings, created_at, updated_at)
      VALUES (
        'Default Company',
        'default',
        'tenant_default',
        'active',
        '{"permissions": ["*"], "limits": {"users": 100, "storage": "10GB", "campaigns": 50}}',
        NOW(),
        NOW()
      )
      ON CONFLICT (subdomain) DO NOTHING;
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    // Eliminar triggers
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS tenant_schema_trigger ON tenants;
    `);

    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS tenant_cleanup_trigger ON tenants;
    `);

    // Eliminar funciones
    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS create_tenant_schema();
    `);

    await queryInterface.sequelize.query(`
      DROP FUNCTION IF EXISTS cleanup_tenant_schema();
    `);

    // Eliminar esquemas de tenants existentes
    const tenants = await queryInterface.sequelize.query(
      'SELECT schema_name FROM tenants',
      { type: 'SELECT' }
    );

    for (const tenant of tenants as any[]) {
      await queryInterface.sequelize.query(
        `DROP SCHEMA IF EXISTS "${tenant.schema_name}" CASCADE`
      );
    }

    // Eliminar tabla
    await queryInterface.dropTable("tenants");
  }
};