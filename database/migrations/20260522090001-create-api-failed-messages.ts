import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables: string[]) => tables.includes("ApiFailedMessages"));

    if (!tableExists) {
      await queryInterface.createTable("ApiFailedMessages", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        whatsappId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Whatsapps", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        number: {
          type: DataTypes.STRING,
          allowNull: true
        },
        message: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        error: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        errorCode: {
          type: DataTypes.STRING,
          allowNull: true
        },
        errorSubcode: {
          type: DataTypes.STRING,
          allowNull: true
        },
        fbtraceId: {
          type: DataTypes.STRING,
          allowNull: true
        },
        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "pending"
        },
        retryCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        ticketId: {
          type: DataTypes.INTEGER,
          allowNull: true
        },
        endpoint: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "send-template"
        },
        metadata: {
          type: DataTypes.JSONB,
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
    }

    await queryInterface.addIndex("ApiFailedMessages", ["companyId", "createdAt"], {
      name: "idx_api_failed_messages_company_created"
    }).catch(() => undefined);
    await queryInterface.addIndex("ApiFailedMessages", ["companyId", "status"], {
      name: "idx_api_failed_messages_company_status"
    }).catch(() => undefined);
    await queryInterface.addIndex("ApiFailedMessages", ["companyId", "endpoint"], {
      name: "idx_api_failed_messages_company_endpoint"
    }).catch(() => undefined);
  },

  down: async (_queryInterface: QueryInterface) => {
    // BD SAGRADA: no eliminamos la tabla de errores en rollback automático.
  }
};
