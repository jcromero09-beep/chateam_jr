import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Multi-empresa] Sessions.activeCompanyId — empresa activa de la sesión, para
 * que el switch de empresa sobreviva a los refresh del token (RefreshTokenService
 * la lee en vez del companyId del refresh token, que apunta a la empresa home).
 */
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Sessions", "activeCompanyId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Companies", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Sessions", "activeCompanyId");
  }
};
