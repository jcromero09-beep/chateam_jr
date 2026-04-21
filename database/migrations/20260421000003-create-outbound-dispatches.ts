/**
 * FASE 6 Coexistencia WhatsApp — OutboundDispatches.
 *
 * Registra cada intento de envío saliente con trazabilidad completa:
 *   - quién lo pidió (agente, cron, IA, campaign, followup)
 *   - qué mode eligió el agente (auto/force_meta/force_baileys/sticky)
 *   - qué provider terminó usando el router (+ fallback si aplicó)
 *   - providerMessageId (wamid / Baileys key.id) para reconciliación
 *   - status: queued | dispatched | acked | failed | fallback
 *   - duración, errores, reintentos
 *
 * BD SAGRADA — down vacío.
 */
import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.createTable("OutboundDispatches", {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "UnifiedConversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Tickets", key: "id" },
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
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      provider: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      requestedMode: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      requestedBy: {
        type: DataTypes.STRING(32),
        allowNull: true
      },
      fallbackApplied: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      fallbackFromProvider: {
        type: DataTypes.STRING(32),
        allowNull: true
      },
      providerMessageId: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      bodyPreview: {
        type: DataTypes.STRING(200),
        allowNull: true
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "queued"
      },
      attemptCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      lastError: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      traceId: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      durationMs: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      requestedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      dispatchedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      ackedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      ackLevel: {
        type: DataTypes.INTEGER,
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

    await queryInterface.addIndex("OutboundDispatches", {
      fields: ["ticketId", "requestedAt"],
      name: "idx_outbound_dispatches_ticket"
    });
    await queryInterface.addIndex("OutboundDispatches", {
      fields: ["conversationId", "requestedAt"],
      name: "idx_outbound_dispatches_conversation"
    });
    await queryInterface.addIndex("OutboundDispatches", {
      fields: ["providerMessageId"],
      name: "idx_outbound_dispatches_provider_msg_id"
    });
    await queryInterface.addIndex("OutboundDispatches", {
      fields: ["companyId", "status", "requestedAt"],
      name: "idx_outbound_dispatches_company_status_time"
    });
    await queryInterface.addIndex("OutboundDispatches", {
      fields: ["traceId"],
      name: "idx_outbound_dispatches_trace_id"
    });
  },

  down: async (_q: QueryInterface): Promise<void> => {
    // BD SAGRADA
  }
};
