/**
 * Upgrade OpenAI text models to GPT-5.5.
 *
 * La API key no cambia: solo actualizamos el modelKey/defaultModel que decide
 * qué modelo llama el router. Migración idempotente y reversible por config.
 *
 * BD SAGRADA: no borra filas ni claves. down() es no-op.
 */
import { QueryInterface } from "sequelize";

const GPT55 = "gpt-5.5";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    if (dialect !== "postgres") return;

    await sequelize.query(`
      INSERT INTO "AIEntities" (
        "key",
        "title",
        "engine",
        "type",
        "inputPrice",
        "outputPrice",
        "maxTokens",
        "capabilities",
        "status",
        "isSelected",
        "metadata",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        '${GPT55}',
        'GPT-5.5',
        'openai',
        'text',
        0.005000,
        0.030000,
        128000,
        '["vision","function_calling","streaming","json_mode","structured_outputs"]'::jsonb,
        'active',
        true,
        '{"context_window":1050000,"max_output_tokens":128000,"pricing_per_1m":{"input":5,"cached_input":0.5,"output":30},"alias":true}'::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("key") DO UPDATE SET
        "title" = EXCLUDED."title",
        "engine" = EXCLUDED."engine",
        "type" = EXCLUDED."type",
        "inputPrice" = EXCLUDED."inputPrice",
        "outputPrice" = EXCLUDED."outputPrice",
        "maxTokens" = EXCLUDED."maxTokens",
        "capabilities" = EXCLUDED."capabilities",
        "status" = 'active',
        "isSelected" = true,
        "metadata" = EXCLUDED."metadata",
        "updatedAt" = NOW();
    `);

    await sequelize.query(`
      UPDATE "AIEntities"
      SET "isSelected" = false, "updatedAt" = NOW()
      WHERE "engine" = 'openai'
        AND "type" IN ('text', 'chat', 'completion', 'multimodal')
        AND "key" <> '${GPT55}';

      UPDATE "AIEntities"
      SET "isSelected" = true, "status" = 'active', "updatedAt" = NOW()
      WHERE "key" = '${GPT55}';
    `);

    await sequelize.query(`
      UPDATE "AIProviderConfigs"
      SET
        "settings" = jsonb_set(
          COALESCE("settings", '{}'::jsonb),
          '{defaultModel}',
          '"${GPT55}"'::jsonb,
          true
        ),
        "updatedAt" = NOW()
      WHERE "provider" = 'openai'
        AND "isActive" = true;
    `);

    await sequelize.query(`
      UPDATE "AIAgentConfigs"
      SET "modelKey" = '${GPT55}', "updatedAt" = NOW()
      WHERE "modelKey" IN (
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4',
        'gpt-4-turbo',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-0125',
        'claude-haiku-4-5-20251001',
        'claude-3-5-sonnet-20241022',
        'claude-3-haiku-20240307',
        'gemini-1.5-pro',
        'gemini-1.5-flash'
      );
    `);

    await sequelize.query(`
      DO $$
      BEGIN
        IF to_regclass('"AIChatbotConfigs"') IS NOT NULL THEN
          UPDATE "AIChatbotConfigs"
          SET "modelKey" = '${GPT55}', "updatedAt" = NOW()
          WHERE "modelKey" IN (
            'gpt-4.1',
            'gpt-4.1-mini',
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4',
            'gpt-4-turbo',
            'gpt-3.5-turbo',
            'gpt-3.5-turbo-0125'
          );
        END IF;
      END$$;
    `);
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no se revierte automáticamente. Para rollback operativo,
    // cambia AIProviderConfigs.settings.defaultModel y AIAgentConfigs.modelKey
    // desde el panel/configuración al modelo anterior.
  }
};
