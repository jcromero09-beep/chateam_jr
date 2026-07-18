import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("Sessions", {
      id: {
        type: DataTypes.STRING(36),
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      refreshTokenHash: {
        type: DataTypes.STRING(128),
        allowNull: false
      },
      userAgent: {
        type: DataTypes.STRING(512),
        allowNull: true
      },
      ip: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      clientType: {
        type: DataTypes.ENUM("web", "app"),
        allowNull: false,
        defaultValue: "web"
      },
      deviceId: {
        type: DataTypes.STRING(128),
        allowNull: true
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    await queryInterface.addIndex("Sessions", ["userId"]);
    await queryInterface.addIndex("Sessions", ["userId", "clientType"]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("Sessions");
  }
};
