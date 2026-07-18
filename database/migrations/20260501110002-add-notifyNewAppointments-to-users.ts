import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Users");

    if (!tableDesc["notifyNewAppointments"]) {
      await queryInterface.addColumn("Users", "notifyNewAppointments", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Recibir notificaciones in-app cuando se cree una cita en la empresa (admins)"
      });
      console.log("✅ Columna notifyNewAppointments agregada a Users");
    } else {
      console.log("⚠️ Columna notifyNewAppointments ya existe, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Users", "notifyNewAppointments");
  }
};
