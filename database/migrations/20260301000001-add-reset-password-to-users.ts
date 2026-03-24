import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Users");

    if (!tableDesc["resetPasswordToken"]) {
      await queryInterface.addColumn("Users", "resetPasswordToken", {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: null,
        comment: "Token temporal para recuperacion de contrasena"
      });
      console.log("✅ Columna resetPasswordToken agregada a Users");
    } else {
      console.log("⚠️ Columna resetPasswordToken ya existe en Users, saltando...");
    }

    if (!tableDesc["resetPasswordExpires"]) {
      await queryInterface.addColumn("Users", "resetPasswordExpires", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Fecha de expiracion del token de reset (30 min)"
      });
      console.log("✅ Columna resetPasswordExpires agregada a Users");
    } else {
      console.log("⚠️ Columna resetPasswordExpires ya existe en Users, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "resetPasswordToken");
    await queryInterface.removeColumn("Users", "resetPasswordExpires");
  }
};
