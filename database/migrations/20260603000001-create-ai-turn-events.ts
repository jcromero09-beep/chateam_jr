import { QueryInterface, DataTypes } from "sequelize";

/**
 * AITurnEvents — ledger no bloqueante de decisiones del orquestador IA.
 *
 * BD SAGRADA: crea tabla/indices si faltan, no destruye datos en down.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableName = "AITurnEvents";
    const tables = await queryInterface.showAllTables();

    if (!tables.includes(tableName)) {
      await queryInterface.createTable(tableName, {
        id: {
          type: DataTypes.BIGINT,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        turnId: {
          type: DataTypes.STRING(64),
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        ticketId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Tickets", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        contactId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Contacts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        whatsappId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Whatsapps", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        messageId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Messages", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        channel: {
          type: DataTypes.STRING(40),
          allowNull: true
        },
        eventType: {
          type: DataTypes.STRING(80),
          allowNull: false
        },
        eventStatus: {
          type: DataTypes.STRING(30),
          allowNull: false,
          defaultValue: "ok"
        },
        reason: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {}
        },
        inputTokens: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        outputTokens: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
        },
        totalTokens: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0
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
    }

    const addIndexIfMissing = async (
      fields: string[],
      options: Record<string, any> = {}
    ) => {
      try {
        const indexesRaw = await (queryInterface as any).showIndex(tableName);
        const indexes: any[] = Array.isArray(indexesRaw) ? indexesRaw : [];
        const exists = indexes.some(
          (idx: any) =>
            (options.name && idx.name === options.name) ||
            JSON.stringify((idx.fields || []).map((f: any) => f.attribute)) ===
              JSON.stringify(fields)
        );
        if (exists) return;
        await queryInterface.addIndex(tableName, fields, options);
      } catch (err: any) {
        console.warn(
          `No se pudo crear indice ${options.name || fields.join("+")} en ${tableName}: ${err?.message || err}`
        );
      }
    };

    await addIndexIfMissing(["turnId"], { name: "ai_turn_events_turn_idx" });
    await addIndexIfMissing(["companyId", "ticketId", "createdAt"], {
      name: "ai_turn_events_company_ticket_created_idx"
    });
    await addIndexIfMissing(["companyId", "whatsappId", "createdAt"], {
      name: "ai_turn_events_company_whatsapp_created_idx"
    });
    await addIndexIfMissing(["companyId", "eventType", "createdAt"], {
      name: "ai_turn_events_company_type_created_idx"
    });
    await addIndexIfMissing(["eventStatus", "createdAt"], {
      name: "ai_turn_events_status_created_idx"
    });
    await addIndexIfMissing(["createdAt"], {
      name: "ai_turn_events_created_idx"
    });
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no eliminar eventos de auditoria.
  }
};
