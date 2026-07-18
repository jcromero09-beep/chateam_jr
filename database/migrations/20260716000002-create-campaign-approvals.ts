import { QueryInterface, DataTypes } from "sequelize";
/**
 * [Fase2·Ola F · F2.1] campaign_approvals: paquete mensual de piezas creativas con
 * aprobación pieza-por-pieza (aprobar/comentar/rechazar), plazo 48h y gating de
 * lanzamiento (F3.1). Primitivo portado de UGCCreatorAssignment.
 */
module.exports = {
  up: async (q: QueryInterface) => {
    await q.createTable("campaign_approvals", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      companyId: { type: DataTypes.INTEGER, allowNull: false },
      period: { type: DataTypes.STRING(7), allowNull: false }, // YYYY-MM
      title: { type: DataTypes.STRING(160) },
      status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "draft" },
      feedback: { type: DataTypes.TEXT },
      revisionCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      submittedAt: { type: DataTypes.DATE },
      approvedAt: { type: DataTypes.DATE },
      approvedByUserId: { type: DataTypes.INTEGER },
      deadlineAt: { type: DataTypes.DATE },
      pieces: { type: DataTypes.JSONB },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    });
    await q.addConstraint("campaign_approvals", { fields: ["companyId", "period"], type: "unique", name: "uq_campaign_approvals_company_period" }).catch(() => undefined);
  },
  down: async (q: QueryInterface) => { await q.dropTable("campaign_approvals"); }
};
