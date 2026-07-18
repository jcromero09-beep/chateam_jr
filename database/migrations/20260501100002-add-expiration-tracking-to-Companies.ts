import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Companies");

    if (!tableDesc["expirationWarningSentAt"]) {
      await queryInterface.addColumn("Companies", "expirationWarningSentAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Marca de tiempo del ultimo envio del aviso 4 dias antes de expirar (idempotencia)"
      });
      console.log("✅ Columna expirationWarningSentAt agregada a Companies");
    } else {
      console.log("⚠️ Columna expirationWarningSentAt ya existe, saltando...");
    }

    if (!tableDesc["expirationNotifiedAt"]) {
      await queryInterface.addColumn("Companies", "expirationNotifiedAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Marca de tiempo del envio del aviso de expiracion (idempotencia)"
      });
      console.log("✅ Columna expirationNotifiedAt agregada a Companies");
    } else {
      console.log("⚠️ Columna expirationNotifiedAt ya existe, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Companies", "expirationWarningSentAt");
    await queryInterface.removeColumn("Companies", "expirationNotifiedAt");
  }
};
