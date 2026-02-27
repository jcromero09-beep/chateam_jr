import { Sequelize, DataTypes, QueryTypes } from 'sequelize';
import * as dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'chateam',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || 'root',
  logging: console.log
});

async function createTable() {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('Connection to database established successfully.');

    // Check if table exists
    const tables = await sequelize.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'appointment_services'",
      { type: QueryTypes.SELECT }
    );

    if (tables.length > 0) {
      console.log('Table appointment_services already exists!');
    } else {
      console.log('Creating appointment_services table...');

      // Create the table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS appointment_services (
          id BIGSERIAL PRIMARY KEY,
          "companyId" BIGINT NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          duration INTEGER NOT NULL,
          "bufferTime" INTEGER DEFAULT 0,
          price DECIMAL(10, 2),
          currency VARCHAR(3) DEFAULT 'USD',
          color VARCHAR(7) DEFAULT '#007bff',
          "isActive" BOOLEAN DEFAULT true,
          "maxAttendees" INTEGER DEFAULT 1,
          "requiresConfirmation" BOOLEAN DEFAULT false,
          settings JSONB DEFAULT '{}',
          "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create index on companyId
      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_appointment_services_company
        ON appointment_services ("companyId");
      `);

      console.log('Table appointment_services created successfully!');
    }

    // List all columns
    const columns = await sequelize.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'appointment_services'
       ORDER BY ordinal_position`,
      { type: QueryTypes.SELECT }
    );

    console.log('\nTable structure:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

createTable();
