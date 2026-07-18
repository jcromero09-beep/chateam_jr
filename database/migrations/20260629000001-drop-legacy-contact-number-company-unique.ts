import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Contactos canonicos: un numero debe existir una sola vez por empresa.
    // La conexion se modela en Tickets.whatsappId y ContactBindings, no en la
    // identidad base del contacto.
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "Contacts_number_companyId_key"
      ON "Contacts" ("number", "companyId");
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS contacts_number_company_whatsapp_unique;
    `);

    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS contacts_number_company_unique;
    `);
  },

  down: async () => {
    // No-op: no degradamos la unicidad canonica de contactos.
  }
};
