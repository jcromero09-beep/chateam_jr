import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_token_transactions_type_created_at"
      ON "AiTokenTransactions" (type, "createdAt" DESC);
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS "idx_ai_token_transactions_company_type_created_at"
      ON "AiTokenTransactions" ("companyId", type, "createdAt" DESC);
    `);
  },

  down: async (): Promise<void> => {
    // Aditiva y segura: no eliminar índices automáticamente en producción.
  }
};
