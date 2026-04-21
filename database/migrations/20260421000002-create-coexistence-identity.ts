/**
 * FASE 3 Coexistencia WhatsApp — Identidad unificada.
 *
 * Crea:
 *   1. UnifiedConversations — una conversación lógica por (companyId, canonicalNumber)
 *      representa a un cliente único aunque tenga bindings en varios proveedores.
 *   2. ContactBindings — mapping N:1 de Contact (físico por conexión) →
 *      UnifiedConversation (lógico).
 *   3. Columnas en Ticket y Message: conversationId (nullable, retrocompat).
 *   4. FK faltante: Whatsapps.linkedWhatsappId (riesgo R9 FASE 0).
 *
 * BD SAGRADA — sólo ADD. Nullable por compatibilidad.
 */
import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    // ═════════════════════════════════════════════════════════
    // 1) UnifiedConversations
    // ═════════════════════════════════════════════════════════
    await queryInterface.createTable("UnifiedConversations", {
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
      /**
       * Número normalizado (dígitos únicamente, sin + ni espacios).
       * Sirve como clave canónica de "quién es este cliente" independiente
       * de que use Meta, Baileys, o ambos.
       */
      canonicalNumber: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      /**
       * Contact.id "primario" — el que el sistema considera canónico
       * cuando hay múltiples bindings para mostrar nombre/avatar/tags.
       */
      primaryContactId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "active"
      },
      /**
       * Política de routing de salida:
       *   'auto'          — decide OutboundRoutingService (default)
       *   'force_meta'    — forzar Meta siempre
       *   'force_baileys' — forzar Baileys siempre
       *   'sticky_inbound'— seguir el último canal de entrada
       */
      routingPolicy: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "auto"
      },
      /**
       * Canal efectivo del último evento (entrada o salida):
       * 'meta' | 'baileys'.
       */
      currentChannel: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      lastInboundChannel: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      lastOutboundChannel: {
        type: DataTypes.STRING(20),
        allowNull: true
      },
      lastInboundAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      lastOutboundAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // UNIQUE: una sola conversación por (companyId, canonicalNumber)
    await queryInterface.addIndex("UnifiedConversations", {
      fields: ["companyId", "canonicalNumber"],
      unique: true,
      name: "idx_unified_conversations_company_number_unique"
    });

    await queryInterface.addIndex("UnifiedConversations", {
      fields: ["companyId", "status", "lastInboundAt"],
      name: "idx_unified_conversations_company_status_time"
    });

    // ═════════════════════════════════════════════════════════
    // 2) ContactBindings
    // ═════════════════════════════════════════════════════════
    await queryInterface.createTable("ContactBindings", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      conversationId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: "UnifiedConversations", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
      },
      contactId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      /**
       * 'meta' | 'baileys' | 'telegram' | ...
       */
      provider: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      /**
       * Identificador del contacto en el proveedor:
       *   Meta: wa_id o phoneNumberId:wa_id
       *   Baileys: remoteJid
       *   Telegram: telegramUserId
       */
      providerIdentifier: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      firstSeenAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      lastSeenAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Un binding único por conversación + proveedor + identificador
    await queryInterface.addIndex("ContactBindings", {
      fields: ["conversationId", "provider", "providerIdentifier"],
      unique: true,
      name: "idx_contact_bindings_conv_provider_ident_unique"
    });

    await queryInterface.addIndex("ContactBindings", {
      fields: ["companyId", "provider", "providerIdentifier"],
      name: "idx_contact_bindings_company_provider_ident"
    });

    await queryInterface.addIndex("ContactBindings", {
      fields: ["contactId"],
      name: "idx_contact_bindings_contact"
    });

    await queryInterface.addIndex("ContactBindings", {
      fields: ["whatsappId"],
      name: "idx_contact_bindings_whatsapp"
    });

    // ═════════════════════════════════════════════════════════
    // 3) Ticket.conversationId (nullable, retrocompat)
    // ═════════════════════════════════════════════════════════
    await queryInterface.addColumn("Tickets", "conversationId", {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "UnifiedConversations", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await queryInterface.addIndex("Tickets", {
      fields: ["conversationId"],
      name: "idx_tickets_conversation_id"
    });

    // Hint: último canal por el que entró este ticket (auditoría rápida).
    await queryInterface.addColumn("Tickets", "inboundChannelHint", {
      type: DataTypes.STRING(20),
      allowNull: true
    });

    // ═════════════════════════════════════════════════════════
    // 4) Message.conversationId (nullable, retrocompat)
    // ═════════════════════════════════════════════════════════
    await queryInterface.addColumn("Messages", "conversationId", {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "UnifiedConversations", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await queryInterface.addIndex("Messages", {
      fields: ["conversationId"],
      name: "idx_messages_conversation_id"
    });

    // ═════════════════════════════════════════════════════════
    // 5) FK faltante: Whatsapps.linkedWhatsappId (R9)
    // ═════════════════════════════════════════════════════════
    // Sólo se agrega la constraint si no existe. No cambia datos.
    try {
      await queryInterface.addConstraint("Whatsapps", {
        fields: ["linkedWhatsappId"],
        type: "foreign key",
        name: "Whatsapps_linkedWhatsappId_fkey",
        references: { table: "Whatsapps", field: "id" },
        onDelete: "SET NULL",
        onUpdate: "CASCADE"
      });
    } catch (e) {
      // Si ya existe, ignoramos.
    }
  },

  down: async (_queryInterface: QueryInterface): Promise<void> => {
    // BD SAGRADA — down vacío por política.
  }
};
