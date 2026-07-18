/**
 * Script de migración: Prompts con apiKey → aiProviderId
 *
 * ⚠️ CRÍTICO: Este script es OBLIGATORIO
 * Sin un aiProviderId, el sistema no puede determinar a qué URL conectar
 * (OpenAI, Azure, Anthropic, DeepSeek, etc.)
 *
 * Crea un AIProviderConfig por cada apiKey única y actualiza prompts
 */

import Prompt from "../models/Prompt";
import AIProviderConfig from "../models/AIProviderConfig";
import { Op } from "sequelize";
import "../database"; // Inicializar conexión DB

async function migratePromptsToAIProvider() {
  console.log("🔄 Iniciando migración de prompts legacy...");

  try {
    // 1. Obtener todos los prompts con apiKey pero sin aiProviderId
    const legacyPrompts = await Prompt.findAll({
      where: {
        apiKey: { [Op.ne]: null },
        aiProviderId: null
      }
    });

    console.log(`📊 Encontrados ${legacyPrompts.length} prompts legacy`);

    if (legacyPrompts.length === 0) {
      console.log("✅ No hay prompts legacy para migrar");
      return;
    }

    // 2. Agrupar por companyId y apiKey
    const promptsByCompanyAndKey = new Map<string, Prompt[]>();

    for (const prompt of legacyPrompts) {
      const key = `${prompt.companyId}:${prompt.apiKey}`;
      if (!promptsByCompanyAndKey.has(key)) {
        promptsByCompanyAndKey.set(key, []);
      }
      promptsByCompanyAndKey.get(key)!.push(prompt);
    }

    console.log(`🏢 ${promptsByCompanyAndKey.size} combinaciones únicas de compañía/apiKey`);

    // 3. Crear AIProviderConfig para cada combinación única
    let migrated = 0;
    let errors = 0;

    for (const [key, prompts] of promptsByCompanyAndKey) {
      const [companyIdStr, apiKey] = key.split(':');
      const companyId = Number(companyIdStr);

      try {
        console.log(`\n🔄 Procesando ${prompts.length} prompts para compañía ${companyId}...`);

        // Verificar si ya existe un provider con esta apiKey
        let provider = await AIProviderConfig.findOne({
          where: {
            companyId: companyId,
            apiKey: apiKey
          }
        });

        if (provider) {
          console.log(`   ℹ️  Provider ${provider.id} ya existe para esta apiKey`);
        } else {
          // Crear AIProviderConfig
          provider = await AIProviderConfig.create({
            companyId: companyId,
            provider: 'openai',
            name: `OpenAI (migrado desde prompts)`,
            apiKey: apiKey,
            isActive: true,
            isDefault: prompts.length > 1, // Default si tiene múltiples prompts
            connectionStatus: 'pending',

            // Solo generación de texto habilitada para legacy
            textGenerationEnabled: true,
            translationEnabled: false,
            imageGenerationEnabled: false,
            imageAnalysisEnabled: false,
            speechToTextEnabled: false,

            settings: {
              defaultModel: 'gpt-4o',
              defaultTemperature: 0.7,
              defaultMaxTokens: 2000
            }
          });

          console.log(`   ✅ Provider ${provider.id} creado`);
        }

        // Actualizar todos los prompts con este aiProviderId
        for (const prompt of prompts) {
          await prompt.update({
            aiProviderId: provider.id,
            // Copiar baseUrl y capabilities del provider
            baseUrl: provider.baseUrl || provider.settings?.baseUrl,
            capabilities: {
              textGenerationEnabled: provider.textGenerationEnabled,
              translationEnabled: provider.translationEnabled,
              imageGenerationEnabled: provider.imageGenerationEnabled,
              imageAnalysisEnabled: provider.imageAnalysisEnabled,
              speechToTextEnabled: provider.speechToTextEnabled
            }
            // Mantener apiKey por compatibilidad durante transición
          });
          migrated++;
        }

        console.log(`   ✅ ${prompts.length} prompts actualizados con aiProviderId ${provider.id}`);
      } catch (error) {
        console.error(`   ❌ Error migrando prompts para ${key}:`, error.message);
        errors++;
      }
    }

    console.log("\n📊 Resumen de migración:");
    console.log(`   ✅ Prompts migrados: ${migrated}`);
    console.log(`   ❌ Errores: ${errors}`);
    console.log("✅ Migración completada");

  } catch (error) {
    console.error("❌ Error fatal durante migración:", error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  migratePromptsToAIProvider()
    .then(() => {
      console.log("\n✅ Script de migración completado exitosamente");
      process.exit(0);
    })
    .catch(err => {
      console.error("\n❌ Error fatal:", err);
      process.exit(1);
    });
}

export default migratePromptsToAIProvider;
