import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Agregar columna whastsAppTemplateId
    await queryInterface.addColumn('Campaigns', 'whastsAppTemplateId', {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'WhatsAppTemplates',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Agregar columna templateParams
    await queryInterface.addColumn('Campaigns', 'templateParams', {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    });

    // Agregar columna useTemplate
    await queryInterface.addColumn('Campaigns', 'useTemplate', {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: false
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn('Campaigns', 'useTemplate');
    await queryInterface.removeColumn('Campaigns', 'templateParams');
    await queryInterface.removeColumn('Campaigns', 'whastsAppTemplateId');
  }
};
