import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('Media', {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Companies', key: 'id' }
      },
      storageProvider: {
        type: DataTypes.STRING,
        defaultValue: 's3'
      },
      storageKey: {
        type: DataTypes.STRING,
        allowNull: false
      },
      contentType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      sizeBytes: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('active', 'expiring', 'expired', 'deleted'),
        defaultValue: 'active'
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      referencesCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      isLegalHold: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('Media', ['companyId']);
    await queryInterface.addIndex('Media', ['expiresAt']);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('Media');
  }
};