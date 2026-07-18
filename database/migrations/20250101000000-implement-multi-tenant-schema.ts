import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Crear esquema para cada empresa existente
    const companies = await queryInterface.sequelize.query(
      'SELECT id FROM "Companies"',
      { type: 'SELECT' }
    );

    for (const company of companies as any[]) {
      const schemaName = `tenant_${company.id}`;
      await queryInterface.sequelize.query(
        `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`
      );
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const companies = await queryInterface.sequelize.query(
      'SELECT id FROM "Companies"',
      { type: 'SELECT' }
    );

    for (const company of companies as any[]) {
      const schemaName = `tenant_${company.id}`;
      await queryInterface.sequelize.query(
        `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`
      );
    }
  }
};