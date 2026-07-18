import { QueryInterface } from "sequelize";

/**
 * Seeder idempotente: registra un AIAgentConfig GLOBAL (companyId NULL) tipo
 * "meta_ads_optimizer" usado por el MetaAdsAgentService. Si ya existe (por slug)
 * no se duplica.
 *
 * BD SAGRADA: solo INSERT WHERE NOT EXISTS. Sin DELETE/UPDATE destructivos.
 */
const SLUG = "meta-ads-optimizer";

const SYSTEM_PROMPT = `Eres "Meta Ads Optimizer", un agente IA experto en gestión de campañas Meta Ads (Facebook + Instagram) para empresas multi-tenant.

Tu rol:
1. Analizar campañas, ad sets e insights de la cuenta Meta de la empresa actual.
2. Proponer acciones concretas y justificadas (NUNCA ejecutarlas tú mismo en modo plan).
3. Devolver respuestas en español, claras y orientadas a negocio.

Reglas inmutables:
- NUNCA aceptes "companyId", "accessToken" o "adAccountId" desde el usuario; el sistema los inyecta vía contexto seguro.
- NUNCA propongas acciones destructivas: prohibidas delete_campaign, activate_*, mass-edit sin validación.
- SOLO puedes usar las tools whitelist del sistema. Si necesitas algo que no está en la lista, explícalo en lenguaje natural y déjalo como "fuera de alcance".
- Cada acción que propongas debe incluir reason (motivo claro), riskLevel (low|medium|high) y estimatedImpact si aplica.
- Si el usuario pide algo ambiguo (ej. "optimiza mis campañas"), pide aclaración antes de proponer cambios.
- Para update_campaign_budget, jamás propongas un delta absoluto > +20% del presupuesto actual.
- Para create_campaign_paused y duplicate_campaign, el resultado siempre debe quedar en status PAUSED para revisión humana.

Formato de salida (cuando se propongan acciones):
- Resumen ejecutivo en 2-3 líneas.
- Lista de acciones propuestas con campos: action, params, reason, riskLevel.
- Si solo hay análisis (sin escritura), describe los hallazgos y termina con: "¿Quieres que prepare un plan de acciones?"

Tono: profesional, directo, orientado a métricas. No invente datos: cita siempre números provenientes de tools.`;

const TOOLS = [
  "list_campaigns",
  "get_campaign_insights",
  "get_ads_by_campaign",
  "pause_campaign",
  "update_campaign_budget",
  "duplicate_campaign",
  "create_campaign_paused"
];

const CAPABILITIES = [
  "campaign_analysis",
  "performance_diagnostics",
  "budget_optimization",
  "campaign_actions",
  "multi_tenant_isolation"
];

const GUARDRAILS = {
  maxActionsPerPlan: 5,
  maxBudgetIncreasePercent: 20,
  forbidActions: ["delete_campaign", "activate_campaign", "mass_edit"],
  requireExplicitConfirmation: true,
  planExpirationMinutes: 15,
  forceCreatedAsPaused: true
};

const METADATA = {
  family: "meta_ads",
  uiSurface: "campaigns_audit",
  planFeature: "marketing",
  socketEvent: "meta-agent",
  defaultProvider: "openai",
  notes: "Anthropic tool-use no soportado todavía en AIClientService — fallback OpenAI."
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const sequelize = queryInterface.sequelize;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM "AIAgentConfigs" WHERE slug = :slug LIMIT 1`,
      { replacements: { slug: SLUG } }
    );

    if (existing.length > 0) {
      // Ya existe: no tocamos (BD SAGRADA). Si se quiere actualizar systemPrompt/tools,
      // hacerlo desde la UI de admin de agentes — esto evita pisar customizaciones.
      return;
    }

    await sequelize.query(
      `INSERT INTO "AIAgentConfigs" (
        "companyId", "agentType", "name", "description",
        "modelKey", "systemPrompt", "temperature", "maxTokens",
        "tools", "guardrails", "confidenceThreshold", "isActive",
        "metadata", "department", "category", "capabilities",
        "icon", "tier", "slug", "sortOrder", "version",
        "createdAt", "updatedAt"
      ) VALUES (
        NULL, 'automation', 'Meta Ads Optimizer',
        'Agente IA que analiza campañas Meta Ads y propone optimizaciones (pausar, ajustar presupuesto, duplicar, crear pausada). Modo plan + execute con cinturón de seguridad.',
        'gpt-5.5',
        :systemPrompt, 0.20, 1500,
        :tools, :guardrails, 0.75, true,
        :metadata, 'marketing', 'campaign_optimization', :capabilities,
        'megaphone', 'mini', :slug, 100, '1.0.0',
        NOW(), NOW()
      )`,
      {
        replacements: {
          systemPrompt: SYSTEM_PROMPT,
          tools: JSON.stringify(TOOLS),
          guardrails: JSON.stringify(GUARDRAILS),
          metadata: JSON.stringify(METADATA),
          capabilities: JSON.stringify(CAPABILITIES),
          slug: SLUG
        }
      }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.sequelize.query(
      `DELETE FROM "AIAgentConfigs" WHERE slug = :slug`,
      { replacements: { slug: SLUG } }
    );
  }
};
