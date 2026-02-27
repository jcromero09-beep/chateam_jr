import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Verificar si la tabla ya existe
    const tableExists = await queryInterface.sequelize.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'CompanyTokenUsage'
      );`
    ).then((result: any) => result[0][0].exists);

    if (!tableExists) {
      await queryInterface.createTable("CompanyTokenUsage", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        company_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        model: {
          type: DataTypes.STRING,
          allowNull: false
        },
        month: {
          type: DataTypes.STRING(7), // YYYY-MM
          allowNull: false
        },
        tokens_month: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        tokens_total: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        cost_usd_month: {
          type: DataTypes.DECIMAL(10, 5),
          defaultValue: 0
        },
        cost_usd_total: {
          type: DataTypes.DECIMAL(12, 5),
          defaultValue: 0
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });

      // Crear índices
      await queryInterface.addIndex("CompanyTokenUsage", ["company_id"]);
      await queryInterface.addIndex("CompanyTokenUsage", ["model"]);
      await queryInterface.addIndex("CompanyTokenUsage", ["month"]);
      await queryInterface.addIndex("CompanyTokenUsage", ["company_id", "model", "month"], {
        unique: true,
        name: "company_token_usage_unique"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("CompanyTokenUsage");
  }
};
