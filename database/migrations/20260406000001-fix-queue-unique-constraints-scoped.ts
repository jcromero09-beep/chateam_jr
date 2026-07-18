import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // El constraint de name ya estaba scoped (unique_queue_name_per_company)
    // Solo necesitamos corregir el constraint de color que era global

    // Eliminar constraint UNIQUE global de color
    await queryInterface.removeConstraint("Queues", "unique_queue_color");

    // Crear constraint UNIQUE compuesto (color, companyId)
    await queryInterface.addConstraint("Queues", {
      fields: ["color", "companyId"],
      type: "unique",
      name: "unique_queue_color_per_company",
    });
  },

  down: async (queryInterface: QueryInterface) => {
    // Revertir: eliminar compuesto y restaurar global
    await queryInterface.removeConstraint("Queues", "unique_queue_color_per_company");

    await queryInterface.addConstraint("Queues", {
      fields: ["color"],
      type: "unique",
      name: "unique_queue_color",
    });
  },
};
