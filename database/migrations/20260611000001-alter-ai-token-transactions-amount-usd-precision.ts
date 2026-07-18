import { QueryInterface, DataTypes } from "sequelize";

const tableExists = async (queryInterface: QueryInterface, tableName: string): Promise<boolean> => {
  const result = await queryInterface.sequelize.query(
    `SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = :tableName
    ) AS exists;`,
    { replacements: { tableName }, type: "SELECT" as any }
  ) as any[];

  return Boolean(result?.[0]?.exists);
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    if (!(await tableExists(queryInterface, "AiTokenTransactions"))) return;

    await queryInterface.changeColumn("AiTokenTransactions", "amountUsd", {
      type: DataTypes.DECIMAL(12, 6),
      allowNull: true,
      comment: "Monto en USD de compras o consumos"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    if (!(await tableExists(queryInterface, "AiTokenTransactions"))) return;

    await queryInterface.changeColumn("AiTokenTransactions", "amountUsd", {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Monto en USD (solo para compras)"
    });
  }
};
