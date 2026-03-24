/**
 * AdCopyGeneratorService
 *
 * Genera copy publicitario optimizado usando IA (OpenAI).
 * Segmenta el copy por nivel de conciencia del usuario
 * según el framework de Eugene Schwartz (5 niveles).
 *
 * Niveles de conciencia:
 *  1. unaware          — No saben que tienen el problema
 *  2. problem_aware    — Saben el problema, no buscan solución
 *  3. solution_aware   — Buscan solución, no conocen tu producto
 *  4. product_aware    — Conocen el producto, no han comprado
 *  5. most_aware       — Listos para comprar, necesitan la oferta
 */

import OpenAI from "openai";
import AIProviderConfig from "../models/AIProviderConfig";
import AiTokenTransaction from "../models/AiTokenTransaction";
import AISubplan from "../models/AISubplan";
import AppError from "../errors/AppError";
import crypto from "crypto";
import logger from "../utils/logger";

const LOG_PREFIX = "[AdCopyGeneratorService]";
const DEFAULT_TOKEN_LIMIT = 10000;

// ============================================================
// TIPOS
// ============================================================

export type ConsciousnessLevel =
  | "unaware"
  | "problem_aware"
  | "solution_aware"
  | "product_aware"
  | "most_aware";

export type CopyTone =
  | "professional"
  | "casual"
  | "urgent"
  | "inspirational"
  | "educational"
  | "humorous";

export type CopyObjective =
  | "AWARENESS"
  | "TRAFFIC"
  | "ENGAGEMENT"
  | "LEADS"
  | "APP_PROMOTION"
  | "SALES";

export interface GenerateCopyInput {
  productName: string;
  productDescription: string;
  targetAudience: string;
  consciousnessLevel: ConsciousnessLevel;
  tone?: CopyTone;
  objective?: CopyObjective;
  industry?: string;
  uniqueValueProposition?: string;
  callToAction?: string;
  variationsCount?: number; // 1-5, default 3
}

export interface AdCopyVariation {
  id: string;
  headline: string;           // 40 chars max (Meta primary headline)
  primaryText: string;        // 125 chars ideal (main body text)
  description: string;        // 30 chars max (link description)
  cta: string;                // Button CTA: "Comprar ahora", "Más información", etc.
  hook: string;               // Opening line neurológicamente optimizada
  consciousnessLevel: ConsciousnessLevel;
  tone: CopyTone;
  approach: string;           // Explicación del enfoque usado
  psychologicalTriggers: string[]; // Gatillos usados: urgency, social_proof, fear, etc.
}

export interface GenerateCopyResult {
  variations: AdCopyVariation[];
  consciousnessLevel: ConsciousnessLevel;
  consciousnessDescription: string;
  recommendedApproach: string;
  tokensUsed: number;
}

// ============================================================
// DESCRIPCIÓN DE NIVELES DE CONCIENCIA (Eugene Schwartz)
// ============================================================

const CONSCIOUSNESS_DESCRIPTIONS: Record<ConsciousnessLevel, string> = {
  unaware: "El usuario NO sabe que tiene un problema. Requiere despertar conciencia del problema antes de mencionar el producto.",
  problem_aware: "El usuario SABE que tiene un problema pero no busca solución activamente. Requiere validar el dolor y presentar posibilidades.",
  solution_aware: "El usuario BUSCA una solución pero no conoce tu producto. Requiere diferenciar tu solución y mostrar resultados.",
  product_aware: "El usuario CONOCE tu producto pero no ha comprado. Requiere eliminar objeciones y generar confianza.",
  most_aware: "El usuario está LISTO para comprar. Solo necesita la oferta correcta, precio o incentivo."
};

const CONSCIOUSNESS_APPROACH: Record<ConsciousnessLevel, string> = {
  unaware: "Storytelling + problema oculto. NO mencionar el producto directamente. Despertar curiosidad sobre el problema.",
  problem_aware: "Validar el dolor + mostrar que no están solos + hint de solución. Empatía y comprensión.",
  solution_aware: "Diferenciar vs otras soluciones + resultados específicos + prueba social. Datos y credibilidad.",
  product_aware: "Eliminar objeciones + garantías + urgencia + testimonios. Confianza y seguridad.",
  most_aware: "Oferta directa + precio + urgencia + CTA claro. Acción inmediata."
};

// ============================================================
// TEMPLATES DE HOOKS NEURALES POR NIVEL
// ============================================================

const HOOK_PATTERNS: Record<ConsciousnessLevel, string[]> = {
  unaware: [
    "El 73% de [audiencia] no sabe que...",
    "Lo que nadie te dice sobre [problema]...",
    "Por qué [resultado negativo común] no es tu culpa...",
    "[Resultado inesperado] después de [acción común]"
  ],
  problem_aware: [
    "¿Cansado de [dolor específico]?",
    "Si [situación del problema], esto te interesa...",
    "Finalmente, una forma de [resolver dolor] sin [objeción]",
    "[Problema] NO tiene por qué ser así"
  ],
  solution_aware: [
    "Olvida [solución popular] — aquí está lo que REALMENTE funciona:",
    "Hemos ayudado a [número] [audiencia] a lograr [resultado]",
    "[Resultado específico] en [timeframe] — garantizado",
    "La diferencia entre [competencia] y nosotros es simple:"
  ],
  product_aware: [
    "¿Dudas sobre [producto]? Esto cambiará tu mente:",
    "[Objeción común] — te entendemos. Por eso creamos [feature]",
    "Miles de [audiencia] ya lo usan. ¿Por qué tú no?",
    "Prueba [producto] SIN riesgo — [garantía]"
  ],
  most_aware: [
    "🔥 Oferta especial por tiempo limitado:",
    "Última oportunidad: [oferta] termina [fecha/hora]",
    "Obtén [beneficio] HOY por solo [precio]",
    "[Descuento]% de descuento solo este [día/semana]"
  ]
};

// ============================================================
// SERVICIO
// ============================================================

export class AdCopyGeneratorService {
  private openai: OpenAI | null = null;
  private provider: any = null;
  private companyId: number = 1; // SuperAdmin company ID

  constructor() {}

  private async initializeOpenAI(): Promise<void> {
    if (this.openai) return;

    try {
      this.provider = await AIProviderConfig.findOne({
        where: {
          companyId: this.companyId,
          provider: "openai",
          isActive: true,
          textGenerationEnabled: true
        },
        order: [["isDefaultForText", "DESC"], ["id", "DESC"]]
      });

      if (!this.provider) {
        if (!process.env.OPENAI_API_KEY) {
          throw new AppError("No se encontró proveedor de OpenAI configurado", 500);
        }
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        return;
      }

      const apiKey = this.decryptApiKey(this.provider.apiKey);
      this.openai = new OpenAI({
        apiKey,
        baseURL: this.provider.baseUrl || undefined
      });
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
    if (!ivHex || !encrypted) return encryptedKey; // Legacy sin encriptar

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
      where: { companyId, module: "campaigns_copy", type: "usage", createdAt: { [Op.gte]: startOfMonth } }
    });
    const used = transactions.reduce((sum: number, t: any) => sum + Math.abs(t.tokens), 0);
    return { available: used < tokenLimit, remaining: Math.max(0, tokenLimit - used) };
  }

  private async recordTokenUsage(companyId: number, tokens: number, referenceId: string): Promise<void> {
    const { remaining } = await this.checkTokenLimit(companyId);
    await AiTokenTransaction.create({
      companyId,
      type: "usage",
      tokens: -Math.abs(tokens),
      module: "campaigns_copy",
      referenceId,
      balanceAfter: remaining - tokens,
      description: "Generación de copy publicitario con IA"
    });
  }

  // ============================================================
  // MÉTODO PRINCIPAL: generateCopy
  // ============================================================

  async generateCopy(companyId: number, input: GenerateCopyInput): Promise<GenerateCopyResult> {
    const { available } = await this.checkTokenLimit(companyId);
    if (!available) throw new AppError("Límite de tokens de IA alcanzado para este mes", 429);

    await this.initializeOpenAI();
    if (!this.openai) throw new AppError("No se pudo inicializar OpenAI", 500);

    const {
      productName,
      productDescription,
      targetAudience,
      consciousnessLevel,
      tone = "professional",
      objective = "SALES",
      industry = "General",
      uniqueValueProposition = "",
      callToAction = "",
      variationsCount = 3
    } = input;

    const count = Math.min(Math.max(variationsCount, 1), 5);

    const consciousnessDesc = CONSCIOUSNESS_DESCRIPTIONS[consciousnessLevel];
    const consciousnessApproach = CONSCIOUSNESS_APPROACH[consciousnessLevel];
    const hookExamples = HOOK_PATTERNS[consciousnessLevel].slice(0, 2).join("\n- ");

    const prompt = `Eres un copywriter experto en Meta Ads con 15 años de experiencia.
Usa el framework de los 5 niveles de conciencia de Eugene Schwartz para crear copy altamente efectivo.

## DATOS DEL PRODUCTO
- Producto/Servicio: ${productName}
- Descripción: ${productDescription}
- Industria: ${industry}
- Propuesta de Valor Única: ${uniqueValueProposition || "(no especificada, infiere del producto)"}
- CTA preferido: ${callToAction || "(elige el más apropiado)"}
- Objetivo de campaña Meta: ${objective}

## AUDIENCIA OBJETIVO
${targetAudience}

## NIVEL DE CONCIENCIA DEL USUARIO: ${consciousnessLevel.toUpperCase()}
${consciousnessDesc}

## ESTRATEGIA DE COPY PARA ESTE NIVEL
${consciousnessApproach}

## TONO: ${tone}

## EJEMPLOS DE HOOKS PARA ESTE NIVEL
- ${hookExamples}

## INSTRUCCIONES
Genera EXACTAMENTE ${count} variaciones de copy para Meta Ads.
Cada variación debe ser DIFERENTE en enfoque y ángulo de persuasión.

Para CADA variación, responde con este JSON:
{
  "id": "v1|v2|v3|etc",
  "headline": "Titular de máximo 40 caracteres. Impactante y específico.",
  "primaryText": "Texto principal de 100-150 caracteres. Directo al punto con el nivel de conciencia correcto.",
  "description": "Descripción de máximo 30 caracteres. Complementa el headline.",
  "cta": "Texto exacto del botón: Comprar ahora|Más información|Registrarse|Descargar|Contactar|Obtener oferta",
  "hook": "Frase de apertura de 10-15 palabras. Diseñada para detener el scroll y generar curiosidad.",
  "consciousnessLevel": "${consciousnessLevel}",
  "tone": "${tone}",
  "approach": "Una frase explicando el ángulo psicológico usado en esta variación.",
  "psychologicalTriggers": ["lista", "de", "gatillos", "usados", "ej: urgency, social_proof, curiosity, fear_of_missing_out, authority, reciprocity"]
}

RESTRICCIONES:
- NO uses emojis excesivos (máximo 1-2 por variación)
- NO hagas claims falsos ni promesas imposibles
- SÍ adapta el lenguaje exactamente al nivel de conciencia
- SÍ varía los ángulos entre variaciones

Responde SOLO con JSON válido:
{
  "variations": [array de ${count} variaciones]
}`;

    const model = this.provider?.settings?.defaultModel || "gpt-4o";
    const jsonModeModels = ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo-1106", "gpt-4-turbo-preview", "gpt-4-turbo"];
    const supportsJsonMode = jsonModeModels.some(m => model.includes(m));

    logger.info(`${LOG_PREFIX} Generando ${count} variaciones para nivel ${consciousnessLevel}`);

    const completion = await this.openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: "Eres un copywriter experto en Meta Ads. Responde SOLO con JSON válido." },
        { role: "user", content: prompt }
      ],
      ...(supportsJsonMode && { response_format: { type: "json_object" } }),
      temperature: 0.7,
      max_tokens: 3000
    });

    const content = completion.choices[0].message.content;
    const tokensUsed = completion.usage?.total_tokens || 0;

    try {
      const parsed = JSON.parse(content || "{}");
      await this.recordTokenUsage(companyId, tokensUsed, `copy_${Date.now()}`);

      return {
        variations: parsed.variations || [],
        consciousnessLevel,
        consciousnessDescription: consciousnessDesc,
        recommendedApproach: consciousnessApproach,
        tokensUsed
      };
    } catch {
      throw new AppError("Error procesando respuesta del generador de copy", 500);
    }
  }

  // ============================================================
  // METADATA: niveles y tonos disponibles
  // ============================================================

  getMetadata(): {
    consciousnessLevels: Array<{ value: ConsciousnessLevel; label: string; description: string }>;
    tones: Array<{ value: CopyTone; label: string }>;
    objectives: Array<{ value: CopyObjective; label: string }>;
  } {
    return {
      consciousnessLevels: [
        { value: "unaware", label: "Sin conciencia", description: CONSCIOUSNESS_DESCRIPTIONS.unaware },
        { value: "problem_aware", label: "Consciente del problema", description: CONSCIOUSNESS_DESCRIPTIONS.problem_aware },
        { value: "solution_aware", label: "Consciente de la solución", description: CONSCIOUSNESS_DESCRIPTIONS.solution_aware },
        { value: "product_aware", label: "Consciente del producto", description: CONSCIOUSNESS_DESCRIPTIONS.product_aware },
        { value: "most_aware", label: "Listo para comprar", description: CONSCIOUSNESS_DESCRIPTIONS.most_aware }
      ],
      tones: [
        { value: "professional", label: "Profesional" },
        { value: "casual", label: "Casual / Amigable" },
        { value: "urgent", label: "Urgente / Escasez" },
        { value: "inspirational", label: "Inspiracional" },
        { value: "educational", label: "Educacional" },
        { value: "humorous", label: "Humorístico" }
      ],
      objectives: [
        { value: "AWARENESS", label: "Reconocimiento de marca" },
        { value: "TRAFFIC", label: "Tráfico al sitio" },
        { value: "ENGAGEMENT", label: "Interacción" },
        { value: "LEADS", label: "Generación de leads" },
        { value: "APP_PROMOTION", label: "Instalaciones de app" },
        { value: "SALES", label: "Conversiones / Ventas" }
      ]
    };
  }
}

export default new AdCopyGeneratorService();
