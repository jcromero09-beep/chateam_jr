import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("WebChatConversations", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      uuid: {
        type: DataTypes.STRING,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      widgetId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "WebChatWidgets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      sessionId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      visitorName: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "Visitante Web"
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "open"
      },
      unreadMessages: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      lastMessageAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
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

    await queryInterface.addIndex("WebChatConversations", ["companyId", "status"]);
    await queryInterface.addIndex("WebChatConversations", ["widgetId", "sessionId"], {
      unique: true,
      name: "WebChatConversations_widget_session_unique"
    });
    await queryInterface.addIndex("WebChatConversations", ["lastMessageAt"]);

    await queryInterface.createTable("WebChatConversationMessages", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      conversationId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "WebChatConversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      direction: {
        type: DataTypes.STRING,
        allowNull: false
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      senderId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "text"
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true
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

    await queryInterface.addIndex("WebChatConversationMessages", ["conversationId", "createdAt"]);
    await queryInterface.addIndex("WebChatConversationMessages", ["companyId", "direction"]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("WebChatConversationMessages");
    await queryInterface.dropTable("WebChatConversations");
  }
};
