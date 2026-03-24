/**
 * Service: GenerateVideoWithOpenAIService (CORE)
 * Servicio principal para generar videos con OpenAI Sora
 * Orquesta: validacion, creditos, creacion de registro, y envio a cola Bull
 *
 * IMPORTANTE: Este servicio es ASYNC - NO espera a que el video se genere.
 * El flujo es:
 * 1. Validar, debitar creditos, crear registro con status='pending'
 * 2. Enviar job a la cola Bull (videoGenerationQueue)
 * 3. Retornar inmediatamente con el registro de generacion
 * 4. El worker procesa el job: llama a OpenAI Sora, descarga video, actualiza status
 *
 * CORRECCIONES DE SEGURIDAD IMPLEMENTADAS:
 * - Race Condition Fix: Creditos se debitan ANTES de enviar a la cola
 * - Transaction Leak Fix: Generation se crea DENTRO de transaccion
 * - SELECT FOR UPDATE: Previene double-spending con lock de fila
 */

import AIVideoGeneration from "../../models/AIVideoGeneration";
import AIVideoCreditTransaction from "../../models/AIVideoCreditTransaction";
import AIProviderConfig from "../../models/AIProviderConfig";
import Company from "../../models/Company";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import { Transaction } from "sequelize";
import { getDefaultProviderForCapability } from "../AIProviderService";

// Servicios de creditos
import CalculateVideoCostService from "../AIVideoCreditService/CalculateVideoCostService";
import { AI_VIDEO_CONFIG } from "../../config/aiVideoPricing";

// Cola Bull para procesamiento async
import Bull from "bull";
import { REDIS_URI_CONNECTION } from "../../config/redis";

// Crear referencia a la cola de generacion de video
const REDIS_ENABLED = Boolean(REDIS_URI_CONNECTION && REDIS_URI_CONNECTION.trim());
const videoGenerationQueue: Bull.Queue | null = REDIS_ENABLED
  ? new Bull("VideoGenerationQueue", REDIS_URI_CONNECTION)
  : null;

interface GenerateVideoRequest {
  companyId: number;
  userId: number;
  prompt: string;
  videoSize: string;
  duration: number;
  stylePreset?: string;
  model?: string;
}

export interface GenerateVideoResponse {
  generation: {
    id: number;
    status: string;
    prompt: string;
    videoSize: string;
    duration: number;
    totalCreditsUsed: number;
  };
  creditsRemaining: number;
}

/**
 * SERVICIO PRINCIPAL: Inicia generacion de video con OpenAI Sora (ASYNC)
 *
 * FLUJO SEGURO (corregido):
 * 1. Validacion inicial (sin transaccion)
 * 2. Obtener configuracion de OpenAI (sin transaccion)
 * 3. Mejorar prompt con estilo
 * 4. INICIAR TRANSACCION con SELECT FOR UPDATE
 *    4.1 Lock Company row
 *    4.2 Calcular costo
 *    4.3 Verificar creditos
 *    4.4 Debitar creditos
 *    4.5 Crear AIVideoCreditTransaction
 *    4.6 Crear AIVideoGeneration (status='pending')
 *    4.7 COMMIT
 * 5. ENVIAR A COLA BULL (videoGenerationQueue)
 * 6. RETORNAR INMEDIATAMENTE con generation + creditsRemaining
 *
 * @param request Datos de la generacion
 * @returns Generacion con status 'pending' y creditos restantes
 * @throws AppError si falla la validacion o el debito de creditos
 */
const GenerateVideoWithOpenAIService = async ({
  companyId,
  userId,
  prompt,
  videoSize,
  duration,
  stylePreset = 'cinematic',
  model = 'sora-2'
}: GenerateVideoRequest): Promise<GenerateVideoResponse> => {

  // ============================================================================
  // PASO 1: VALIDACIONES INICIALES (sin transaccion)
  // ============================================================================

  console.log(`\n🎬 ===== INICIANDO GENERACION DE VIDEO =====`);
  console.log(`Company: ${companyId}, User: ${userId}`);
  console.log(`Prompt: "${prompt.substring(0, 50)}..."`);
  console.log(`Tamano: ${videoSize}, Duracion: ${duration}s`);
  console.log(`Estilo: ${stylePreset}, Modelo: ${model}`);

  // Validar prompt
  if (!prompt || prompt.trim().length < 2) {
    throw new AppError("El prompt debe tener al menos 2 caracteres", 400);
  }

  // Validar que Redis este disponible (necesario para la cola)
  if (!videoGenerationQueue) {
    throw new AppError(
      "El servicio de generacion de video no esta disponible. Redis no esta configurado.",
      503
    );
  }

  // ============================================================================
  // PASO 2: OBTENER CONFIGURACION DE OPENAI (sin transaccion)
  // ============================================================================

  console.log(`\n📋 Buscando proveedor de IA para generacion de video...`);

  const aiProviderConfig = await getDefaultProviderForCapability('images');

  if (!aiProviderConfig) {
    throw new AppError(
      "No hay proveedores de IA configurados con capacidad de generacion de imagenes/video. " +
      "Configura un proveedor con imageGenerationEnabled en el panel de SuperAdmin.",
      404
    );
  }

  // Validar que tenga la capacidad habilitada
  if (!aiProviderConfig.imageGenerationEnabled) {
    throw new AppError(
      `El proveedor ${aiProviderConfig.name} no tiene habilitada la generacion de imagenes/video.`,
      400
    );
  }

  if (!aiProviderConfig.apiKey) {
    throw new AppError(
      `La configuracion del proveedor ${aiProviderConfig.name} no tiene API Key. Configura el API Key.`,
      400
    );
  }

  console.log(`✅ Proveedor encontrado: ${aiProviderConfig.name} (${aiProviderConfig.provider})`);
  console.log(`   - imageGenerationEnabled: ${aiProviderConfig.imageGenerationEnabled}`);
  console.log(`   - isDefaultForImages: ${aiProviderConfig.isDefaultForImages}`);

  // ============================================================================
  // PASO 3: CONSTRUIR PROMPT CON ESTILO
  // ============================================================================

  let enhancedPrompt = prompt.trim();
  if (stylePreset && stylePreset !== 'realistic') {
    enhancedPrompt = `${prompt}. Video should be in ${stylePreset} style.`;
  }

  console.log(`\n📝 Prompt mejorado: "${enhancedPrompt.substring(0, 80)}..."`);

  // ============================================================================
  // PASO 4: TRANSACCION SEGURA - DEBITAR CREDITOS ANTES DE ENVIAR A COLA
  // ============================================================================
  // CRITICO: Esta seccion previene race conditions de double-spending
  // El lock SELECT FOR UPDATE bloquea la fila de Company mientras se procesa
  // ============================================================================

  console.log(`\n🔒 Iniciando transaccion segura para debito de creditos...`);

  let generation: AIVideoGeneration;
  let costCalculation: { totalCredits: number; costUsd?: number };
  let previousBalance: number;
  let newBalance: number;
  let creditTransactionId: number;

  const reserveTransaction = await sequelize.transaction({
    isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED
  });

  try {
    // ============================================================================
    // PASO 4.1: SELECT FOR UPDATE - Bloquear fila de Company
    // ============================================================================

    const company = await Company.findByPk(companyId, {
      lock: reserveTransaction.LOCK.UPDATE,
      transaction: reserveTransaction
    });

    if (!company) {
      throw new AppError("Company no encontrada", 404);
    }

    // ============================================================================
    // PASO 4.2: Calcular costo
    // ============================================================================

    costCalculation = await CalculateVideoCostService({
      videoSize,
      duration,
      model
    });

    console.log(`💰 Costo calculado: ${costCalculation.totalCredits} creditos`);
    console.log(`   - Tamano: ${videoSize}, Duracion: ${duration}s`);

    // ============================================================================
    // PASO 4.3: Verificar creditos disponibles (bajo lock)
    // ============================================================================

    const availableCredits = company.aiTokenBalance || 0;
    previousBalance = availableCredits;

    console.log(`💳 Creditos disponibles: ${availableCredits}`);
    console.log(`💳 Creditos requeridos: ${costCalculation.totalCredits}`);

    if (availableCredits < costCalculation.totalCredits) {
      throw new AppError(
        `Creditos insuficientes. Disponibles: ${availableCredits}, Requeridos: ${costCalculation.totalCredits}, Deficit: ${costCalculation.totalCredits - availableCredits}`,
        402 // Payment Required
      );
    }

    // ============================================================================
    // PASO 4.4: DEBITAR CREDITOS INMEDIATAMENTE (reservar antes de la cola)
    // ============================================================================

    newBalance = availableCredits - costCalculation.totalCredits;

    await company.update({
      aiTokenBalance: newBalance
    }, { transaction: reserveTransaction });

    console.log(`✅ Creditos reservados (debitados): ${costCalculation.totalCredits}`);
    console.log(`   Balance anterior: ${previousBalance}`);
    console.log(`   Balance nuevo: ${newBalance}`);

    // ============================================================================
    // PASO 4.5: Crear transaccion de creditos
    // ============================================================================

    const creditTransaction = await AIVideoCreditTransaction.create({
      companyId,
      userId,
      transactionType: 'debit',
      creditsAmount: costCalculation.totalCredits,
      costUsd: costCalculation.costUsd,
      description: `Generacion de video ${videoSize} de ${duration}s`,
      status: 'completed',
      metadata: {
        videoSize,
        duration,
        model,
        stylePreset,
        promptPreview: prompt.substring(0, 100)
      }
    }, { transaction: reserveTransaction });

    creditTransactionId = creditTransaction.id;

    // ============================================================================
    // PASO 4.6: Crear registro de generacion (dentro de transaccion)
    // ============================================================================

    generation = await AIVideoGeneration.create({
      companyId,
      userId,
      aiProviderConfigId: aiProviderConfig.id,
      prompt: enhancedPrompt,
      videoSize,
      duration,
      stylePreset,
      model,
      status: 'pending',
      totalCreditsUsed: costCalculation.totalCredits,
      totalCostUsd: costCalculation.costUsd,
      progress: 0,
      metadata: {
        originalPrompt: prompt,
        enhancedPrompt,
        requestedAt: new Date().toISOString(),
        creditTransactionId
      }
    }, { transaction: reserveTransaction });

    console.log(`✅ Generacion creada (ID: ${generation.id}) con status='pending'`);

    // ============================================================================
    // PASO 4.7: COMMIT - Liberar lock y confirmar debito
    // ============================================================================

    await reserveTransaction.commit();
    console.log(`🔓 Transaccion de reserva completada - Creditos asegurados`);

  } catch (error: any) {
    // Rollback si falla la reserva de creditos
    await reserveTransaction.rollback();
    console.error(`❌ Error en reserva de creditos:`, error.message);
    throw error;
  }

  // ============================================================================
  // PASO 5: ENVIAR A COLA BULL (ASYNC - no espera resultado)
  // ============================================================================

  try {
    console.log(`\n📤 Enviando job a cola VideoGenerationQueue...`);

    await videoGenerationQueue.add(
      'GenerateVideo',
      {
        generationId: generation.id,
        companyId,
        userId
      },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 }, // 30s, 150s
        removeOnComplete: { age: 3600, count: 100 }, // 1 hora, max 100
        removeOnFail: { age: 86400, count: 500 }, // 24 horas, max 500
        timeout: AI_VIDEO_CONFIG.API_TIMEOUT + 60000 // Timeout API + 1 minuto extra
      }
    );

    console.log(`✅ Job enviado a cola VideoGenerationQueue para generacion ID: ${generation.id}`);

  } catch (queueError: any) {
    // ============================================================================
    // ERROR AL ENVIAR A COLA - Reembolsar creditos
    // ============================================================================

    console.error(`❌ Error al enviar job a cola:`, queueError.message);
    console.log(`\n💳 Reembolsando ${costCalculation.totalCredits} creditos por fallo en cola...`);

    try {
      // Reembolso atomico
      await Company.increment('aiTokenBalance', {
        by: costCalculation.totalCredits,
        where: { id: companyId }
      });

      // Marcar transaccion como refunded
      await AIVideoCreditTransaction.update(
        { status: 'refunded' },
        { where: { id: creditTransactionId } }
      );

      // Crear transaccion de reembolso
      await AIVideoCreditTransaction.create({
        companyId,
        userId,
        aiVideoGenerationId: generation.id,
        transactionType: 'refund',
        creditsAmount: costCalculation.totalCredits,
        description: `Reembolso por fallo al enviar a cola (ID: ${generation.id})`,
        status: 'completed',
        metadata: {
          originalTransactionId: creditTransactionId,
          errorMessage: queueError.message,
          refundedAt: new Date().toISOString()
        }
      });

      console.log(`✅ Creditos reembolsados exitosamente`);

    } catch (refundError: any) {
      console.error(`❌ ERROR CRITICO: No se pudieron reembolsar creditos:`, refundError.message);
      console.error(`   CompanyId: ${companyId}`);
      console.error(`   Creditos a reembolsar: ${costCalculation.totalCredits}`);
      console.error(`   GenerationId: ${generation.id}`);
    }

    // Marcar generacion como fallida
    await generation.update({
      status: 'failed',
      errorMessage: `Error al enviar a cola de procesamiento: ${queueError.message}`,
      metadata: {
        ...generation.metadata,
        failedAt: new Date().toISOString(),
        errorDetails: queueError.message,
        creditsRefunded: true
      }
    });

    throw new AppError(
      `Error al iniciar la generacion de video. Los creditos han sido reembolsados.`,
      500
    );
  }

  // ============================================================================
  // PASO 6: RETORNAR INMEDIATAMENTE (no espera al video)
  // ============================================================================

  console.log(`\n🎬 ===== GENERACION ENVIADA A COLA =====`);
  console.log(`   GenerationId: ${generation.id}`);
  console.log(`   Status: pending`);
  console.log(`   Creditos restantes: ${newBalance}\n`);

  return {
    generation: {
      id: generation.id,
      status: 'pending',
      prompt: generation.prompt,
      videoSize: generation.videoSize,
      duration: generation.duration,
      totalCreditsUsed: generation.totalCreditsUsed
    },
    creditsRemaining: newBalance
  };
};

export default GenerateVideoWithOpenAIService;
