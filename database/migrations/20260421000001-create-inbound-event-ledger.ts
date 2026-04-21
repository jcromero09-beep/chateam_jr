/**
 * FASE 2 Coexistencia WhatsApp — Dedupe e idempotencia.
 *
 * Crea la tabla InboundEventLedger para garantizar que cada evento
 * recibido de un proveedor (Meta webhook, Baileys messages.upsert,
 * smb_message_echoes, statuses, etc.) sea procesado UNA SOLA VEZ,
 * incluso si:
 *   - Meta reintenta el mismo webhook
 *   - Dos nodos PM2 reciben el mismo evento en paralelo
 *   - Llega messages y smb_message_echoes con el mismo wamid
 *   - Hay retry por timeout
 *
 * Regla INAMOVIBLE: BD SAGRADA — sólo ADD, nunca DROP.
 * El método DOWN se deja vacío intencionalmente.
 */
import { QueryInterface, DataTypes } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.createTable("InboundEventLedger", {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        // NO CASCADE en delete: el ledger es auditoría,
        // debe sobrevivir a borrado de empresa (aunque BD SAGRADA
        // prohíbe eso por política). Usamos RESTRICT defensivo.
        onDelete: "RESTRICT"
      },
      /**
       * Proveedor físico del evento.
       * Valores esperados:
       *   'meta'          — webhook Meta Cloud API (messages)
       *   'meta_echo'     — smb_message_echoes (eco del staff Business App)
       *   'meta_status'   — statuses webhook (sent/delivered/read/failed)
       *   'meta_history'  — history sync webhook
       *   'meta_appsync'  — smb_app_state_sync
       *   'baileys'       — Baileys messages.upsert (inbound del cliente)
       *   'baileys_fromme' — Baileys fromMe=true (eco del staff desde WhatsApp Web)
       *   'baileys_ack'   — Baileys messages.update (status)
       */
      provider: {
        type: DataTypes.STRING(32),
        allowNull: false
      },
      /**
       * Clave única del evento dentro de (companyId).
       * Se construye así (ejemplos):
       *   meta:wamid.HBgMN...
       *   meta_echo:wamid.HBgMN...
       *   meta_status:wamid.HBgMN...:delivered
       *   baileys:3EB0ABC...@broadcast:false
       *   baileys_fromme:3EB0ABC...@broadcast:true
       *
       * El segundo componente es siempre el providerMessageId del proveedor.
       */
      eventKey: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      /**
       * Hash SHA256 del payload crudo (compresible).
       * Permite detectar si dos eventos con mismo eventKey
       * traen payload distinto (bug del proveedor o intento de tampering).
       */
      payloadHash: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      /**
       * traceId del contexto que registró el evento.
       * Correlaciona con logs [coex.inbound] / [coex.dedupe].
       */
      traceId: {
        type: DataTypes.STRING(64),
        allowNull: true
      },
      /**
       * Resultado del procesamiento:
       *   'processed' — primera vez, aceptado
       *   'duplicate' — ya existía (dedupe)
       *   'dropped'   — ignorado deliberadamente (echo conocido, replay)
       *   'error'     — error durante procesamiento (ver errorMessage)
       */
      outcome: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "processed"
      },
      /**
       * Mensaje de error si outcome='error'.
       */
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      /**
       * Identificadores opcionales para consultas rápidas.
       * Todos nullable — no todos los eventos tienen ticket/mensaje.
       */
      ticketId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      messageId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      providerMessageId: {
        type: DataTypes.STRING(500),
        allowNull: true
      },
      /**
       * Instante de recepción del evento (puede diferir de createdAt
       * si el ledger se persiste async).
       */
      receivedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      /**
       * Instante de finalización del procesamiento.
       */
      processedAt: {
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

    // === Índices ===

    // CRÍTICO: UNIQUE (companyId, eventKey)
    // Esta es la barrera atómica contra duplicados.
    // Cualquier INSERT concurrente con mismo (companyId, eventKey)
    // fallará con SequelizeUniqueConstraintError y el listener
    // detectará duplicado sin disparar side effects.
    await queryInterface.addIndex("InboundEventLedger", {
      fields: ["companyId", "eventKey"],
      unique: true,
      name: "idx_inbound_event_ledger_company_eventkey_unique"
    });

    // Consultas de auditoría rápidas por proveedor + tiempo
    await queryInterface.addIndex("InboundEventLedger", {
      fields: ["companyId", "provider", "receivedAt"],
      name: "idx_inbound_event_ledger_company_provider_time"
    });

    // Búsqueda por providerMessageId (reconciliación de acks)
    await queryInterface.addIndex("InboundEventLedger", {
      fields: ["providerMessageId"],
      name: "idx_inbound_event_ledger_provider_msg_id"
    });

    // Búsqueda por outcome (monitoreo de errores / duplicados)
    await queryInterface.addIndex("InboundEventLedger", {
      fields: ["outcome", "receivedAt"],
      name: "idx_inbound_event_ledger_outcome_time"
    });

    // traceId para correlación con logs
    await queryInterface.addIndex("InboundEventLedger", {
      fields: ["traceId"],
      name: "idx_inbound_event_ledger_trace_id"
    });
  },

  // BD SAGRADA — no destruir datos.
  // El down se deja vacío por política del proyecto.
  down: async (_queryInterface: QueryInterface): Promise<void> => {
    // Intencionalmente vacío. Para rollback manual,
    // el DBA debe ejecutar DROP TABLE con autorización explícita.
  }
};
