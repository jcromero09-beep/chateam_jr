import UGCCampaign from "../models/UGCCampaign";

interface CreativeVariation {
  angle: string;
  hook: string;
  prompt: string;
  caption: string;
  negativePrompt: string;
}

const DEFAULT_ANGLES = [
  "testimonio honesto de usuario",
  "demostracion rapida del producto",
  "problema y solucion",
  "antes y despues",
  "oferta con urgencia",
  "comparacion contra alternativa comun",
  "review casual estilo TikTok"
];

function pickAngle(campaign: UGCCampaign, index: number): string {
  const configured = campaign.generationConfig?.contentAngles || [];
  const angles = configured.length ? configured : DEFAULT_ANGLES;
  return angles[index % angles.length];
}

function normalizeFeatures(features?: string[]): string {
  if (!features?.length) return "beneficios principales del producto";
  return features.slice(0, 5).join(", ");
}

function buildCreativeVariation(
  campaign: UGCCampaign,
  index: number,
  kind: "video" | "image"
): CreativeVariation {
  const brief = campaign.productBrief || {};
  const genConfig = campaign.generationConfig || {};
  const productName = brief.productName || campaign.name;
  const audience = brief.targetAudience || "personas interesadas en el producto";
  const tone = brief.tone || "casual, autentico y natural";
  const cta = brief.callToAction || "conoce mas en el link";
  const angle = pickAngle(campaign, index);
  const language = genConfig.language || "es";
  const features = normalizeFeatures(brief.keyFeatures);

  const hook = [
    `No esperaba que ${productName} hiciera esto`,
    `Si eres ${audience}, mira esto`,
    `Esto me resolvio un problema que tenia todos los dias`,
    `Probe ${productName} para ver si realmente valia la pena`,
    `Tres cosas que note usando ${productName}`
  ][index % 5];

  const promptBase = [
    `UGC ${kind === "video" ? "vertical video" : "social ad image"}, ${angle}`,
    `producto o marca: ${productName}`,
    `audiencia: ${audience}`,
    `tono: ${tone}`,
    `beneficios: ${features}`,
    `call to action: ${cta}`,
    `idioma del copy: ${language}`,
    "realista, natural, smartphone content, luz natural, composicion limpia, autentico, no corporativo"
  ].join(". ");

  return {
    angle,
    hook,
    prompt: `${promptBase}. Hook creativo: ${hook}.`,
    caption: `${hook}. ${cta}`,
    negativePrompt:
      "low quality, blurry, distorted hands, extra fingers, watermark, logo falso, texto ilegible, uncanny, oversaturated"
  };
}

export type { CreativeVariation };
export { buildCreativeVariation };
