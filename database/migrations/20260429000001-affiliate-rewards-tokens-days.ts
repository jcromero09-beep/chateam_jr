/**
 * Migración defensiva — Sistema de afiliados por tokens / días extra.
 *
 * Cambios:
 * - AIAffiliatePrograms: rewardType, rewardTokens, rewardDays
 * - AIAffiliateReferrals: affiliateCompanyId, linkId, referralSlug, rewardType,
 *   rewardTokens, rewardDays, activatedAt, rewardProcessedAt, status (extiende),
 *   updatedAt (timestamps), companyDemoStatus
 *
 * Reglas:
 * - SIEMPRE describeTable + IF NOT EXISTS
 * - NUNCA dropTable / removeColumn de columnas con datos
 * - down() conservador: no destruye nada
 */
import { QueryInterface, DataTypes } from "sequelize";

const addColumnIfMissing = async (
  queryInterface: QueryInterface,
  tableName: string,
  description: Record<string, unknown>,
  columnName: string,
  definition: any
) => {
  if (!description[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const addIndexIfMissing = async (
  queryInterface: QueryInterface,
  tableName: string,
  indexName: string,
  fields: string[]
) => {
  try {
    const indexes: any[] = await (queryInterface as any).showIndex(tableName);
    const exists = indexes.some((i: any) => i.name === indexName);
    if (!exists) {
      await queryInterface.addIndex(tableName, fields, { name: indexName });
    }
  } catch (err) {
    // Si el driver no soporta showIndex, intentamos directamente
    try {
      await queryInterface.addIndex(tableName, fields, { name: indexName });
    } catch (_) {
      // ignorar duplicado
    }
  }
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // ──────────────────────────────────────────────────────────────────────
    // AIAffiliatePrograms
    // ──────────────────────────────────────────────────────────────────────
    const programs = await queryInterface.describeTable("AIAffiliatePrograms");

    await addColumnIfMissing(queryInterface, "AIAffiliatePrograms", programs, "rewardType", {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "tokens"
    });

    await addColumnIfMissing(queryInterface, "AIAffiliatePrograms", programs, "rewardTokens", {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    });

    await addColumnIfMissing(queryInterface, "AIAffiliatePrograms", programs, "rewardDays", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // ──────────────────────────────────────────────────────────────────────
    // AIAffiliateReferrals
    // ──────────────────────────────────────────────────────────────────────
    const referrals = await queryInterface.describeTable("AIAffiliateReferrals");

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "affiliateCompanyId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Companies", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "linkId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "AffiliateLinks", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "referralSlug", {
      type: DataTypes.STRING(80),
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardType", {
      type: DataTypes.STRING(20),
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardTokens", {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardDays", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "activatedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardProcessedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    // updatedAt (la tabla original tenía timestamps:false). Si no existe, agregar
    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "updatedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    // ── Cobro manual de recompensa ──────────────────────────────────────
    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardStatus", {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending"
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardClaimedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, "AIAffiliateReferrals", referrals, "rewardClaimedBy", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    // Índices auxiliares
    await addIndexIfMissing(
      queryInterface,
      "AIAffiliateReferrals",
      "ai_affiliate_referrals_affiliate_company_idx",
      ["affiliateCompanyId"]
    );
    await addIndexIfMissing(
      queryInterface,
      "AIAffiliateReferrals",
      "ai_affiliate_referrals_referred_company_idx",
      ["referredCompanyId"]
    );
    await addIndexIfMissing(
      queryInterface,
      "AIAffiliateReferrals",
      "ai_affiliate_referrals_link_idx",
      ["linkId"]
    );
  },

  // BD SAGRADA: no destruir columnas con datos. down() es no-op intencional.
  down: async (_queryInterface: QueryInterface) => {
    return;
  }
};
