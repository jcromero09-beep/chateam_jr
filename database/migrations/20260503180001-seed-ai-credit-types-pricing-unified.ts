import { QueryInterface } from "sequelize";

/**
 * Siembra los tipos de credito faltantes para el modulo unificado de cobro IA.
 *
 * Estos tipos son usados por AIUsagePricingService.ts.
 * Todos los precios viven en la columna defaultCost — son CONFIGURABLES desde
 * el panel admin sin tocar codigo.
 *
 * Idempotente: solo inserta si la key no existe; nunca borra ni resetea balances.
 *
 * BD SAGRADA: NO toca AICreditBalances ni AICreditTransactions.
 *
 * Fecha: 2026-05-03
 * Autor: ChatEAM JR — Unificacion de cobro IA
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;

    // Definicion idempotente: solo inserta si la key no existe.
    const newTypes: Array<{
      key: string;
      name: string;
      description: string;
      unit: string;
      defaultCost: number;
    }> = [
      {
        key: "classification",
        name: "Clasificacion IA",
        description:
          "Cobro por clasificacion IA (kanban classifier, intent detection, recomendacion de tags). Configurable.",
        unit: "unit",
        defaultCost: 0.5
      },
      {
        key: "automation_action",
        name: "Accion de automatizacion",
        description:
          "Cobro por accion automatizada cobrable (auto-respondedor, workflows). Configurable.",
        unit: "unit",
        defaultCost: 1.0
      },
      {
        key: "flow_execution",
        name: "Ejecucion de FlowBuilder",
        description:
          "Cobro por ejecucion de un nodo IA en FlowBuilder. Configurable.",
        unit: "unit",
        defaultCost: 1.0
      },
      {
        key: "campaign_analysis",
        name: "Analisis de campana",
        description:
          "Cobro por analisis IA de campana (Campaign Wizard, A/B variants, results). Configurable.",
        unit: "unit",
        defaultCost: 2.0
      },
      {
        key: "ugc_video",
        name: "Video UGC IA",
        description:
          "Cobro por generacion de video UGC con IA. Configurable.",
        unit: "unit",
        defaultCost: 25.0
      },
      {
        key: "social_reply",
        name: "Respuesta automatica social",
        description:
          "Cobro por respuesta automatica IA en redes sociales. Configurable.",
        unit: "unit",
        defaultCost: 1.0
      },
      {
        key: "media_summary",
        name: "Resumen de media",
        description:
          "Cobro por resumen IA de archivo multimedia. Configurable.",
        unit: "unit",
        defaultCost: 2.0
      }
    ];

    // INSERT IGNORE-style: solo inserta keys que no existen aun.
    for (const t of newTypes) {
      await sequelize.query(
        `INSERT INTO "AICreditTypes" (key, name, description, unit, "defaultCost", "isActive", "createdAt", "updatedAt")
         SELECT :key, :name, :description, :unit, :defaultCost, true, NOW(), NOW()
         WHERE NOT EXISTS (SELECT 1 FROM "AICreditTypes" WHERE key = :key);`,
        {
          replacements: t
        }
      );
    }

    // Defensive: asegurar que los tipos pre-existentes no esten desactivados.
    // No tocamos defaultCost de tipos existentes — el admin pudo haberlos editado.
    await sequelize.query(
      `UPDATE "AICreditTypes"
       SET "isActive" = true, "updatedAt" = NOW()
       WHERE key IN ('message','image','video','audio_minute','tts_character','rag_query',
                     'embedding_token','agent_execution','kb_document','vision_analysis','pdf_processing')
         AND "isActive" = false;`
    );

    console.log(
      "[Migration] AICreditTypes — Sembrados tipos faltantes para cobro IA unificado (classification, automation_action, flow_execution, campaign_analysis, ugc_video, social_reply, media_summary)"
    );
  },

  down: async (_queryInterface: QueryInterface) => {
    // BD SAGRADA: no se borran tipos para no destruir audit trail historico.
    // Si se necesita revertir, se desactivan manualmente con isActive=false.
    console.log(
      "[Migration] No-op down — los tipos de credito sembrados se mantienen activos."
    );
  }
};
