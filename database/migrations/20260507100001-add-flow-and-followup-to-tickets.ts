import { QueryInterface, DataTypes } from "sequelize";

/**
 * PRIMERA OLA — Feature 1 (TicketFlowEngine) + Feature 2 (Seguimientos automáticos)
 *
 * Agrega columnas a Tickets para:
 *   - Máquina de estados de flujo IA (flowState, flowStep, flowMetadata)
 *   - Seguimientos automáticos (nextFollowupAt, followupCount, lastFollowupAt, followupEnabled)
 *
 * BD SAGRADA: solo ADD COLUMN — no se elimina nada.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Tickets");

    // ─── F1: Flujo IA ────────────────────────────────────────────────────────
    if (!tableDesc["flowState"]) {
      await queryInterface.addColumn("Tickets", "flowState", {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: "intake",
        comment:
          "Estado actual del flujo IA: intake | triage | resolution | followup | escalated | closed"
      });
      console.log("✅ Columna flowState agregada a Tickets");
    }

    if (!tableDesc["flowStep"]) {
      await queryInterface.addColumn("Tickets", "flowStep", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Paso numérico dentro del flowState (incrementa con cada transición)"
      });
      console.log("✅ Columna flowStep agregada a Tickets");
    }

    if (!tableDesc["flowMetadata"]) {
      await queryInterface.addColumn("Tickets", "flowMetadata", {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment:
          "Metadatos del flujo: lastIntent, confidence, sentiment, escalationReason, etc."
      });
      console.log("✅ Columna flowMetadata agregada a Tickets");
    }

    // ─── F2: Seguimientos automáticos ────────────────────────────────────────
    if (!tableDesc["nextFollowupAt"]) {
      await queryInterface.addColumn("Tickets", "nextFollowupAt", {
        type: DataTypes.DATE,
        allowNull: true,
        comment:
          "Próximo timestamp para enviar seguimiento automático (NULL = no programado)"
      });
      console.log("✅ Columna nextFollowupAt agregada a Tickets");
    }

    // NOTA: followup_count y followupEnabled YA existen en el modelo Ticket — se reutilizan.

    if (!tableDesc["lastFollowupAt"]) {
      await queryInterface.addColumn("Tickets", "lastFollowupAt", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Último timestamp en que se envió un seguimiento automático"
      });
      console.log("✅ Columna lastFollowupAt agregada a Tickets");
    }

    if (!tableDesc["followupReason"]) {
      await queryInterface.addColumn("Tickets", "followupReason", {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment:
          "Razón del seguimiento programado: pending_response | unresolved | scheduled_check"
      });
      console.log("✅ Columna followupReason agregada a Tickets");
    }

    // Índice para CronJob de seguimientos (búsqueda rápida)
    try {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "tickets_followup_due_idx"
         ON "Tickets" ("nextFollowupAt", "followupEnabled", "status")
         WHERE "nextFollowupAt" IS NOT NULL AND "followupEnabled" = true;`
      );
      console.log("✅ Índice tickets_followup_due_idx creado");
    } catch (err: any) {
      console.log(`⚠️ Índice tickets_followup_due_idx: ${err.message}`);
    }

    // Índice para consultas por flowState
    try {
      await queryInterface.sequelize.query(
        `CREATE INDEX IF NOT EXISTS "tickets_flow_state_idx"
         ON "Tickets" ("companyId", "flowState", "status");`
      );
      console.log("✅ Índice tickets_flow_state_idx creado");
    } catch (err: any) {
      console.log(`⚠️ Índice tickets_flow_state_idx: ${err.message}`);
    }
  },

  /**
   * BD SAGRADA: el down NO elimina columnas con datos.
   * Solo elimina índices auxiliares para permitir rollback de la estructura.
   */
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "tickets_followup_due_idx";`
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS "tickets_flow_state_idx";`
    );
    console.log(
      "⚠️ Solo se eliminaron índices. Las columnas se preservan (BD SAGRADA)."
    );
  }
};
