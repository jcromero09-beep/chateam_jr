import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();

    // Verificar si la tabla ya existe
    const tables = await queryInterface.showAllTables();
    const tablesArr = (tables as any[]).map((t: any) =>
      typeof t === "string" ? t : t.tableName
    );

    if (tablesArr.includes("Notifications")) {
      console.log("⚠️ Tabla Notifications ya existe, saltando creación...");
      return;
    }

    await queryInterface.createTable("Notifications", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Destinatario de la notificación"
      },
      type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "info",
        comment: "info | success | warning | error"
      },
      category: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "system",
        comment: "system | appointment | campaign | ticket | user | message"
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      actionUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
        comment: "Deep link a la entidad relacionada (ej: /appointments/123)"
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Payload libre (appointmentId, contactId, etc.)"
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
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

    await queryInterface.addIndex("Notifications", ["userId", "isRead", "createdAt"], {
      name: "idx_notifications_user_unread"
    });
    await queryInterface.addIndex("Notifications", ["companyId"], {
      name: "idx_notifications_company"
    });
    await queryInterface.addIndex("Notifications", ["category"], {
      name: "idx_notifications_category"
    });

    console.log("✅ Tabla Notifications creada con índices");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("Notifications");
  }
};
