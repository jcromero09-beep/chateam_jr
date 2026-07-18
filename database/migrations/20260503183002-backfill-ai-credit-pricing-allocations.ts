import { QueryInterface } from "sequelize";

/**
 * Conecta los credit types nuevos de cobro IA con planes y balances existentes.
 *
 * La migracion anterior crea AICreditTypes; esta agrega PlanCreditAllocations
 * y crea AICreditBalances para companies ya existentes. Sin este backfill, los
 * nuevos cobros fail-closed bloquearian features en companies con plan activo.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;

    const keys = [
      "classification",
      "automation_action",
      "flow_execution",
      "campaign_analysis",
      "ugc_video",
      "social_reply",
      "media_summary"
    ];

    await sequelize.query(
      `INSERT INTO "PlanCreditAllocations"
        ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
       SELECT p.id, t.id,
        CASE t.key
          WHEN 'classification' THEN CASE p.id WHEN 1 THEN 20 WHEN 2 THEN 200 WHEN 4 THEN 1000 WHEN 8 THEN 10000 ELSE 0 END
          WHEN 'automation_action' THEN CASE p.id WHEN 1 THEN 20 WHEN 2 THEN 200 WHEN 4 THEN 1000 WHEN 8 THEN 10000 ELSE 0 END
          WHEN 'flow_execution' THEN CASE p.id WHEN 1 THEN 5 WHEN 2 THEN 50 WHEN 4 THEN 200 WHEN 8 THEN 2000 ELSE 0 END
          WHEN 'campaign_analysis' THEN CASE p.id WHEN 1 THEN 2 WHEN 2 THEN 20 WHEN 4 THEN 100 WHEN 8 THEN 1000 ELSE 0 END
          WHEN 'ugc_video' THEN CASE p.id WHEN 1 THEN 0 WHEN 2 THEN 1 WHEN 4 THEN 5 WHEN 8 THEN 50 ELSE 0 END
          WHEN 'social_reply' THEN CASE p.id WHEN 1 THEN 0 WHEN 2 THEN 100 WHEN 4 THEN 1000 WHEN 8 THEN 10000 ELSE 0 END
          WHEN 'media_summary' THEN CASE p.id WHEN 1 THEN 1 WHEN 2 THEN 10 WHEN 4 THEN 50 WHEN 8 THEN 500 ELSE 0 END
          ELSE 0
        END,
        false, NOW(), NOW()
       FROM "Plans" p
       CROSS JOIN "AICreditTypes" t
       WHERE t.key IN (:keys)
         AND t."isActive" = true
         AND NOT EXISTS (
           SELECT 1
           FROM "PlanCreditAllocations" pca
           WHERE pca."planId" = p.id
             AND pca."creditTypeId" = t.id
         );`,
      { replacements: { keys } }
    );

    await sequelize.query(
      `INSERT INTO "AICreditBalances"
        ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
       SELECT c.id, pca."creditTypeId", pca."creditsPerCycle", 0, c."dueDate", NOW(), NOW()
       FROM "Companies" c
       JOIN "PlanCreditAllocations" pca ON pca."planId" = c."planId"
       JOIN "AICreditTypes" t ON t.id = pca."creditTypeId"
       WHERE t.key IN (:keys)
         AND NOT EXISTS (
           SELECT 1
           FROM "AICreditBalances" b
           WHERE b."companyId" = c.id
             AND b."creditTypeId" = pca."creditTypeId"
         );`,
      { replacements: { keys } }
    );

    await sequelize.query(
      `UPDATE "AICreditBalances" b
       SET "totalCredits" = pca."creditsPerCycle",
           "updatedAt" = NOW()
       FROM "Companies" c
       JOIN "PlanCreditAllocations" pca ON pca."planId" = c."planId"
       JOIN "AICreditTypes" t ON t.id = pca."creditTypeId"
       WHERE b."companyId" = c.id
         AND b."creditTypeId" = pca."creditTypeId"
         AND t.key IN (:keys)
         AND COALESCE(b."totalCredits", 0) = 0
         AND COALESCE(b."usedCredits", 0) = 0;`,
      { replacements: { keys } }
    );

    console.log(
      "[Migration] AI credit pricing allocations/backfill completado para tipos unificados"
    );
  },

  down: async (_queryInterface: QueryInterface) => {
    console.log(
      "[Migration] No-op down — allocations/balances de creditos IA se conservan por auditabilidad."
    );
  }
};
