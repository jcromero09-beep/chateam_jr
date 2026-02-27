import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.createTable("WebChatWidgets", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      channel: {
        type: DataTypes.STRING(50),
        defaultValue: "whatsapp"
      },
      primaryColor: {
        type: DataTypes.STRING(20),
        defaultValue: "#2196F3"
      },
      secondaryColor: {
        type: DataTypes.STRING(20),
        defaultValue: "#FFC107"
      },
      position: {
        type: DataTypes.STRING(20),
        defaultValue: "bottom-right"
      },
      size: {
        type: DataTypes.STRING(20),
        defaultValue: "medium"
      },
      borderRadius: {
        type: DataTypes.INTEGER,
        defaultValue: 16
      },
      welcomeMessage: {
        type: DataTypes.TEXT,
        defaultValue: "¡Hola! ¿En qué podemos ayudarte?"
      },
      offlineMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      placeholderText: {
        type: DataTypes.STRING(255),
        defaultValue: "Escribe tu mensaje..."
      },
      autoOpen: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      autoOpenDelay: {
        type: DataTypes.INTEGER,
        defaultValue: 3
      },
      showAvatar: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      showAgentName: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      enableSound: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      enableFileUpload: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      workingHoursEnabled: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      workingHours: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      timezone: {
        type: DataTypes.STRING(50),
        defaultValue: "America/Santiago"
      },
      allowedDomains: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      apiKey: {
        type: DataTypes.STRING(100),
        unique: true,
        allowNull: false
      },
      queueId: {
        type: DataTypes.INTEGER,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      customCSS: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE(6),
        allowNull: false
      }
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("WebChatWidgets");
  }
};
