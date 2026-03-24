/**
 * CreativeScoringService
 *
 * Predice el rendimiento de un creativo publicitario ANTES de lanzarlo.
 * Utiliza IA para analizar 5 factores ponderados y generar un score 0-100.
 *
 * Factores de scoring:
 *  - hook_strength       (25%) — Fortaleza de la apertura para detener el scroll
 *  - headline_clarity    (20%) — Claridad y especificidad del titular
 *  - cta_effectiveness   (20%) — Efectividad del llamado a la acción
 *  - emotional_trigger   (15%) — Conexión emocional y gatillos psicológicos
 *  - audience_alignment  (20%) — Alineación mensaje-audiencia-objetivo
 */

import OpenAI from "openai";
import AIProviderConfig from "../models/AIProviderConfig";
import AiTokenTransaction from "../models/AiTokenTransaction";
import AISubplan from "../models/AISubplan";
import AppError from "../errors/AppError";
import crypto from "crypto";
import logger from "../utils/logger";

const LOG_PREFIX = "[CreativeScoringService]";
const DEFAULT_TOKEN_LIMIT = 10000;

// ============================================================
// TIPOS
// ============================================================

export interface ScoreInput {
  headline: string;
  primaryText: string;
  description?: string;
  cta?: string;
  targetAudience: string;
  objective: string;
  industry?: string;
  imageDescription?: string; // Descripción del visual (si se provee)
}

export interface FactorScore {
  score: number;          // 0-100
  weight: number;         // peso en decimal (0.25 = 25%)
  weightedScore: number;  // score * weight
  grade: "A" | "B" | "C" | "D" | "F";
  feedback: string;       // Retroalimentación específica
  improvements: string[]; // Sugerencias de mejora
}

export interface CreativeScoreResult {
  overallScore: number;       // 0-100 weighted average
  grade: "A" | "B" | "C" | "D" | "F";
  prediction: string;         // "Excelente rendimiento esperado" | etc.
  factors: {
    hookStrength: FactorScore;
    headlineClarity: FactorScore;
    ctaEffectiveness: FactorScore;
    emotionalTrigger: FactorScore;
    audienceAlignment: FactorScore;
  };
  topStrengths: string[];     // Top 3 fortalezas del creativo
  criticalIssues: string[];   // Problemas que DEBEN corregirse
  quickWins: string[];        // Mejoras rápidas de alto impacto
  benchmarkComparison: string; // Comparación vs benchmark de la industria
  tokensUsed: number;
}

// ============================================================
// HELPERS
// ============================================================

const FACTOR_WEIGHTS = {
  hookStrength: 0.25,
  headlineClarity: 0.20,
  ctaEffectiveness: 0.20,
  emotionalTrigger: 0.15,
  audienceAlignment: 0.20
};

const scoreToGrade = (score: number): "A" | "B" | "C" | "D" | "F" => {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
};

const scoreToPrediction = (score: number): string => {
  if (score >= 85) return "Excelente — Se espera CTR y conversiones por encima del benchmarks";
  if (score >= 70) return "Bueno — Rendimiento esperado sobre el promedio de la industria";
  if (score >= 55) return "Promedio — Rendimiento aceptable, con oportunidades de mejora";
  if (score >= 40) return "Por debajo del promedio — Requiere optimización antes de lanzar";
  return "Crítico — Alto riesgo de bajo rendimiento y desperdicio de presupuesto";
};

// ============================================================
// SERVICIO
// ============================================================

export class CreativeScoringService {
  private openai: OpenAI | null = null;
  private provider: any = null;
  private companyId: number = 1;

  constructor() {}

  private async initializeOpenAI(): Promise<void> {
    if (this.openai) return;
    try {
      this.provider = await AIProviderConfig.findOne({
        where: { companyId: this.companyId, provider: "openai", isActive: true, textGenerationEnabled: true },
        order: [["isDefaultForText", "DESC"], ["id", "DESC"]]
      });

      if (!this.provider) {
        if (!process.env.OPENAI_API_KEY) throw new AppError("No se encontró proveedor de OpenAI", 500);
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return;
      }

      const apiKey = this.decryptApiKey(this.provider.apiKey);
      this.openai = new OpenAI({ apiKey, baseURL: this.provider.baseUrl || undefined });
    } catch (error: any) {
      throw new AppError("Error al inicializar proveedor de IA", 500);
    }
  }

  private decryptApiKey(encryptedKey: string): string {
    const algorithm = "aes-256-cbc";
    const secretKey = process.env.ENCRYPTION_KEY;
    if (!secretKey) throw new Error("ENCRYPTION_KEY requerida");
    if (secretKey.length !== 32) throw new Error("ENCRYPTION_KEY debe tener 32 caracteres");
    const [ivHex, encrypted] = encryptedKey.split(":");
    if (!ivHex || !encrypted) return encryptedKey;
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(secretKey), iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  private async checkTokenLimit(companyId: number): Promise<{ available: boolean; remaining: number }> {
    let tokenLimit = DEFAULT_TOKEN_LIMIT;
    try {
      const aiSubplan = await AISubplan.findOne({ where: { companyId, isActive: true }, order: [["id", "DESC"]] });
      if (aiSubplan && aiSubplan.tokens > 0) tokenLimit = Number(aiSubplan.tokens);
    } catch {}

    const { Op } = require("sequelize");
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const transactions = await AiTokenTransaction.findAll({
      where: { companyId, module: "campaigns_scoring", type: "usage", createdAt: { [Op.gte]: startOfMonth } }
    });
    const used = transactions.reduce((sum: number, t: any) => sum + Math.abs(t.tokens), 0);
    return { available: used < tokenLimit, remaining: Math.max(0, tokenLimit - used) };
  }

  private async recordTokenUsage(companyId: number, tokens: number, referenceId: string): Promise<void> {
    const { remaining } = await this.checkTokenLimit(companyId);
    await AiTokenTransaction.create({
      companyId, type: "usage", tokens: -Math.abs(tokens),
      module: "campaigns_scoring", referenceId,
      balanceAfter: remaining - tokens,
      description: "Scoring predictivo de creativo publicitario"
    });
  }

  // ============================================================
  // MÉTODO PRINCIPAL: scoreCreative
  // ============================================================

  async scoreCreative(companyId: number, input: ScoreInput): Promise<CreativeScoreResult> {
    const { available } = await this.checkTokenLimit(companyId);
    if (!available) throw new AppError("Límite de tokens de IA alcanzado", 429);

    await this.initializeOpenAI();
    if (!this.openai) throw new AppError("No se pudo inicializar OpenAI", 500);

    const {
      headline,
      primaryText,
      description = "",
      cta = "",
      targetAudience,
      objective,
      industry = "General",
      imageDescription = ""
    } = input;

    const prompt = `Eres un experto en Meta Ads y copywriting con 15 años de experiencia.
Evalúa este creativo publicitario en una escala de 0-100 para cada uno de los 5 factores.

## CREATIVO A EVALUAR
Titular (headline): "${headline}"
Texto principal: "${primaryText}"
Descripción: "${description || "(no provista)"}"
Botón CTA: "${cta || "(no especificado)"}"
${imageDescription ? `Descripción del visual: "${imageDescription}"` : ""}

## CONTEXTO
Audiencia objetivo: ${targetAudience}
Objetivo de campaña: ${objective}
Industria: ${industry}

## FACTORES DE EVALUACIÓN (cada uno de 0-100)

### 1. hook_strength (peso: 25%)
¿Qué tan efectiva es la apertura para detener el scroll?
Evalúa: poder de las primeras palabras, curiosidad generada, promesa implícita.
Benchmarks: Excelente >80, Bueno 60-80, Promedio 40-60, Bajo <40

### 2. headline_clarity (peso: 20%)
¿El titular comunica el beneficio claramente y con especificidad?
Evalúa: claridad del mensaje, especificidad (números, nombres), beneficio obvio.
Benchmarks: Excelente >85, Bueno 65-85, Promedio 45-65, Bajo <45

### 3. cta_effectiveness (peso: 20%)
¿El llamado a la acción genera urgencia y está alineado con el objetivo?
Evalúa: claridad de la acción, urgencia creada, alineación con objetivo.
Benchmarks: Excelente >80, Bueno 60-80, Promedio 40-60, Bajo <40

### 4. emotional_trigger (peso: 15%)
¿El anuncio conecta emocionalmente con la audiencia?
Evalúa: gatillos usados (curiosidad, urgencia, miedo, aspiración, pertenencia).
Benchmarks: Excelente >80, Bueno 60-80, Promedio 40-60, Bajo <40

### 5. audience_alignment (peso: 20%)
¿El mensaje está alineado con la audiencia y el objetivo de campaña?
Evalúa: relevancia del pain point, lenguaje apropiado, promesa correcta para el nivel de conciencia.
Benchmarks: Excelente >85, Bueno 65-85, Promedio 45-65, Bajo <45

## RESPUESTA REQUERIDA
Responde SOLO con JSON válido con esta estructura exacta:
{
  "factors": {
    "hookStrength": {
      "score": número,
      "feedback": "Retroalimentación específica sobre la apertura del anuncio",
      "improvements": ["Mejora concreta 1", "Mejora concreta 2"]
    },
    "headlineClarity": {
      "score": número,
      "feedback": "Retroalimentación específica sobre el titular",
      "improvements": ["Mejora concreta 1", "Mejora concreta 2"]
    },
    "ctaEffectiveness": {
      "score": número,
      "feedback": "Retroalimentación específica sobre el CTA",
      "improvements": ["Mejora concreta 1", "Mejora concreta 2"]
    },
    "emotionalTrigger": {
      "score": número,
      "feedback": "Retroalimentación sobre los gatillos emocionales",
      "improvements": ["Mejora concreta 1", "Mejora concreta 2"]
    },
    "audienceAlignment": {
      "score": número,
      "feedback": "Retroalimentación sobre la alineación con la audiencia",
      "improvements": ["Mejora concreta 1", "Mejora concreta 2"]
    }
  },
  "topStrengths": ["Fortaleza 1", "Fortaleza 2", "Fortaleza 3"],
  "criticalIssues": ["Problema crítico 1 si existe", "Problema crítico 2 si existe"],
  "quickWins": ["Mejora rápida de alto impacto 1", "Mejora rápida 2", "Mejora rápida 3"],
  "benchmarkComparison": "Comparación con benchmarks de la industria ${industry} para objetivo ${objective}"
}`;

    const model = this.provider?.settings?.defaultModel || "gpt-4o";
    const jsonModeModels = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo-1106", "gpt-4-turbo-preview", "gpt-4-turbo"];
    const supportsJsonMode = jsonModeModels.some(m => model.includes(m));

    logger.info(`${LOG_PREFIX} Scoring creativo para empresa ${companyId}`);

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Eres un experto en Meta Ads. Responde SOLO con JSON válido." },
        { role: "user", content: prompt }
      ],
      ...(supportsJsonMode && { response_format: { type: "json_object" } }),
      temperature: 0.2,
      max_tokens: 2500
    });

    const content = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    try {
      const parsed = JSON.parse(content || "{}");
      const f = parsed.factors || {};

      // Calcular scores ponderados
      const factorNames = ["hookStrength", "headlineClarity", "ctaEffectiveness", "emotionalTrigger", "audienceAlignment"] as const;
      const weightMap: Record<string, number> = {
        hookStrength: FACTOR_WEIGHTS.hookStrength,
        headlineClarity: FACTOR_WEIGHTS.headlineClarity,
        ctaEffectiveness: FACTOR_WEIGHTS.ctaEffectiveness,
        emotionalTrigger: FACTOR_WEIGHTS.emotionalTrigger,
        audienceAlignment: FACTOR_WEIGHTS.audienceAlignment
      };

      let overallScore = 0;
      const factors: Record<string, FactorScore> = {} as any;

      for (const factorName of factorNames) {
        const raw = f[factorName] || {};
        const score = Math.min(100, Math.max(0, Number(raw.score) || 50));
        const weight = weightMap[factorName];
        const weightedScore = score * weight;
        overallScore += weightedScore;

        factors[factorName] = {
          score,
          weight,
          weightedScore: Math.round(weightedScore * 10) / 10,
          grade: scoreToGrade(score),
          feedback: raw.feedback || "",
          improvements: raw.improvements || []
        };
      }

      overallScore = Math.round(overallScore);

      await this.recordTokenUsage(companyId, tokensUsed, `score_${Date.now()}`);

      return {
        overallScore,
        grade: scoreToGrade(overallScore),
        prediction: scoreToPrediction(overallScore),
        factors: factors as CreativeScoreResult["factors"],
        topStrengths: parsed.topStrengths || [],
        criticalIssues: parsed.criticalIssues || [],
        quickWins: parsed.quickWins || [],
        benchmarkComparison: parsed.benchmarkComparison || "",
        tokensUsed
      };
    } catch {
      throw new AppError("Error procesando score del creativo", 500);
    }
  }
}

export default new CreativeScoringService();
