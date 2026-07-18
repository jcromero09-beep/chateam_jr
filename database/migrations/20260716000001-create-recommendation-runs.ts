import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Fase2·Ola D · G0] recommendation_runs: auditoría de cada recomendación emitida
 * por el motor estadístico + medición de acierto mes a mes.
 *
 * Cada fila = una recomendación con su MÉTODO estadístico, la probabilidad/IC, el
 * supuesto (explicabilidad NFR) y, más tarde, si acertó (outcome) para medir la
 * tasa de acierto mensual. CREATE TABLE idempotente.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const exists = await queryInterface.tableExists?.("recommendation_runs").catch(() => false);
    if (exists) return;
    await queryInterface.createTable("recommendation_runs", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: { type: DataTypes.INTEGER, allowNull: false },
      runDate: { type: DataTypes.DATEONLY, allowNull: false },
      // G1..G10: qué análisis produjo la recomendación
      kind: { type: DataTypes.STRING(40), allowNull: false },
      method: { type: DataTypes.STRING(60), allowNull: false }, // "z-test 2 proporciones", "IC 95% ratio", etc.
      targetType: { type: DataTypes.STRING(30), allowNull: true }, // campaign | adset | lead | segment | global
      targetId: { type: DataTypes.STRING(60), allowNull: true },
      recommendation: { type: DataTypes.TEXT, allowNull: false },
      // explicabilidad NFR: probabilidad/IC/p-valor + supuesto en JSON
      metrics: { type: DataTypes.JSONB, allowNull: true },
      assumption: { type: DataTypes.TEXT, allowNull: true },
      sufficientData: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // ciclo de vida para medir acierto
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "pending" }, // pending|applied|dismissed
      outcome: { type: DataTypes.STRING(20), allowNull: true }, // hit|miss|unknown
      appliedAt: { type: DataTypes.DATE, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await queryInterface.addIndex("recommendation_runs", ["companyId", "runDate"], {
      name: "idx_recruns_company_date"
    }).catch(() => undefined);
    await queryInterface.addIndex("recommendation_runs", ["companyId", "kind", "status"], {
      name: "idx_recruns_company_kind_status"
    }).catch(() => undefined);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("recommendation_runs");
  }
};
