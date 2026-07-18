import { QueryInterface, DataTypes } from "sequelize";

/**
 * Crea la tabla `KanbanLeadConversionEvents` para tracking de envíos
 * de evento `Lead` a Meta CAPI por asignación de etiquetas Kanban.
 *
 * Idempotente: la tabla puede ser creada automáticamente por sync de
 * Sequelize al registrar el modelo. Esta migración garantiza:
 *  1. Que la tabla exista
 *  2. Los índices simples y compuestos
 *  3. El índice ÚNICO (companyId, contactId, kanbanKey, eventName)
 *     para deduplicar envíos por contacto+etapa+evento.
 *
 * No elimina, trunca ni modifica datos. Cumple BD SAGRADA.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tables = await queryInterface.showAllTables();
    const tableName = "KanbanLeadConversionEvents";

    if (!tables.includes(tableName)) {
      await queryInterface.createTable(tableName, {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: true,
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
        kanbanTagId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Tags", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        kanbanKey: { type: DataTypes.STRING, allowNull: true },
        kanbanTagName: { type: DataTypes.STRING, allowNull: true },
        eventName: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "Lead"
        },
        eventId: { type: DataTypes.STRING, allowNull: true },
        source: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "kanban_label"
        },
        destinationId: { type: DataTypes.STRING, allowNull: true },
        destinationSource: { type: DataTypes.STRING, allowNull: true },
        responseStatus: {
          type: DataTypes.ENUM(
            "pending",
            "sent",
            "success",
            "failed",
            "skipped"
          ),
          allowNull: false,
          defaultValue: "pending"
        },
        fbtraceId: { type: DataTypes.STRING, allowNull: true },
        errorMessage: { type: DataTypes.TEXT, allowNull: true },
        userData: { type: DataTypes.JSON, allowNull: true },
        customData: { type: DataTypes.JSON, allowNull: true },
        fbResponse: { type: DataTypes.JSON, allowNull: true },
        sentAt: { type: DataTypes.DATE, allowNull: true },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false }
      });
    }

    // Helper idempotente
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
        // No bloquear deploy por error de índice
        console.warn(
          `⚠️ No se pudo crear índice ${options.name || fields.join("+")} en ${tableName}: ${err?.message || err}`
        );
      }
    };

    await addIndexIfMissing(["companyId"], {
      name: "klce_companyId_idx"
    });
    await addIndexIfMissing(["ticketId"], { name: "klce_ticketId_idx" });
    await addIndexIfMissing(["contactId"], {
      name: "klce_contactId_idx"
    });
    await addIndexIfMissing(["kanbanTagId"], {
      name: "klce_kanbanTagId_idx"
    });
    await addIndexIfMissing(["kanbanKey"], {
      name: "klce_kanbanKey_idx"
    });
    await addIndexIfMissing(["responseStatus"], {
      name: "klce_responseStatus_idx"
    });
    await addIndexIfMissing(["eventName"], {
      name: "klce_eventName_idx"
    });
    await addIndexIfMissing(["createdAt"], {
      name: "klce_createdAt_idx"
    });

    // Índice ÚNICO de deduplicación
    await addIndexIfMissing(
      ["companyId", "contactId", "kanbanKey", "eventName"],
      {
        name: "klce_dedupe_uq",
        unique: true
      }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    // Por BD SAGRADA NO eliminamos la tabla. Solo dejamos vacía la
    // operación de rollback para que no pueda destruir datos.
    return;
  }
};
