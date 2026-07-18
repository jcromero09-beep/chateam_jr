import logger from "../../utils/logger";

/**
 * Guardrails Service -- Deteccion de PII, prevencion de jailbreak y seguridad de contenido
 *
 * Responsabilidades:
 * 1. Detectar y redactar PII (emails, telefonos, tarjetas de credito, etc.)
 * 2. Detectar intentos de jailbreak y prompt injection
 * 3. Filtrar contenido toxico o danino
 * 4. Validar tanto input del usuario como output del LLM
 */

export interface GuardrailResult {
  passed: boolean;
  violations: Array<{
    type: 'pii' | 'jailbreak' | 'toxicity' | 'offtopic' | 'injection';
    severity: 'low' | 'medium' | 'high' | 'critical';
    detail: string;
    redactedText?: string;
  }>;
  sanitizedInput?: string;
  sanitizedOutput?: string;
  processingMs: number;
}

// PII patterns for detection
const PII_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
  { name: 'phone', pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, replacement: '[PHONE_REDACTED]' },
  { name: 'credit_card', pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CC_REDACTED]' },
  { name: 'ssn', pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  { name: 'cedula', pattern: /\b[VEJGPvejgp]-?\d{5,9}\b/g, replacement: '[CEDULA_REDACTED]' },
  { name: 'rut', pattern: /\b\d{1,2}\.\d{3}\.\d{3}[-]?[0-9kK]\b/g, replacement: '[RUT_REDACTED]' },
  { name: 'cpf', pattern: /\b\d{3}\.\d{3}\.\d{3}[-]?\d{2}\b/g, replacement: '[CPF_REDACTED]' },
  { name: 'ip_address', pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
  { name: 'password_mention', pattern: /(?:contrase[nñ]a|password|clave|pin|c[oó]digo secreto)\s*[:=]\s*\S+/gi, replacement: '[PASSWORD_REDACTED]' },
];

// Jailbreak patterns
const JAILBREAK_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+your\s+(system\s+)?prompt/i,
  /pretend\s+you\s+are\s+(?:not\s+)?an?\s+/i,
  /you\s+are\s+now\s+(?:DAN|in\s+developer\s+mode)/i,
  /disregard\s+(?:all\s+)?(?:safety|content)\s+(?:guidelines|policies|rules)/i,
  /act\s+as\s+if\s+you\s+have\s+no\s+(?:restrictions|limits|rules)/i,
  /jailbreak/i,
  /bypass\s+(?:your|the)\s+(?:safety|content|ethical)\s+(?:filter|guidelines)/i,
  /forget\s+(?:all\s+)?(?:your\s+)?(?:rules|instructions|training)/i,
  /do\s+anything\s+now/i,
  /developer\s+mode\s+enabled/i,
  /override\s+(?:safety|content)\s+(?:protocols?|settings?)/i,
];

// Toxicity keywords (Spanish + English + Portuguese)
const TOXICITY_KEYWORDS: RegExp[] = [
  /\b(?:matar|asesinar|suicid[aio]|bomb[aer]|terroris[tm]|violaci[oó]n)\b/i,
  /\b(?:kill|murder|suicide|bomb|terrorist|rape)\b/i,
  /\b(?:matar|assassin|suic[ií]d|bomba|terroris|estupro)\b/i,
  /\b(?:arma|weapon|gun|pistol|explosiv)\b/i,
  /\b(?:drogas?\s+ilegal|cocaine|heroin|meth|fentanyl)\b/i,
];

/**
 * Validate input text through all guardrails
 */
const validateInput = (text: string): GuardrailResult => {
  const startTime = Date.now();
  const violations: GuardrailResult['violations'] = [];
  let sanitized = text;

  // 1. PII Detection
  for (const piiPattern of PII_PATTERNS) {
    const matches = text.match(piiPattern.pattern);
    if (matches) {
      violations.push({
        type: 'pii',
        severity: piiPattern.name === 'credit_card' ? 'critical' : 'medium',
        detail: `PII detected: ${piiPattern.name} (${matches.length} occurrence(s))`,
        redactedText: matches[0].substring(0, 3) + '***'
      });
      sanitized = sanitized.replace(piiPattern.pattern, piiPattern.replacement);
    }
  }

  // 2. Jailbreak Detection
  for (const jbPattern of JAILBREAK_PATTERNS) {
    if (jbPattern.test(text)) {
      violations.push({
        type: 'jailbreak',
        severity: 'high',
        detail: `Jailbreak attempt detected: ${jbPattern.source.substring(0, 40)}...`
      });
    }
  }

  // 3. Prompt Injection Detection
  const injectionPatterns = [
    /\{\{.*\}\}/g,           // Template injection
    /\$\{.*\}/g,             // Template literal injection
    /<\/?script/gi,          // Script injection
    /system:\s*you\s+are/i,  // System prompt override
  ];
  for (const inj of injectionPatterns) {
    if (inj.test(text)) {
      violations.push({
        type: 'injection',
        severity: 'high',
        detail: 'Potential prompt injection detected'
      });
    }
  }

  // 4. Toxicity Check
  for (const toxPattern of TOXICITY_KEYWORDS) {
    if (toxPattern.test(text)) {
      violations.push({
        type: 'toxicity',
        severity: 'high',
        detail: 'Potentially harmful content detected'
      });
      break; // One is enough
    }
  }

  const hasCritical = violations.some(v => v.severity === 'critical' || v.severity === 'high');

  const result: GuardrailResult = {
    passed: !hasCritical,
    violations,
    sanitizedInput: sanitized,
    processingMs: Date.now() - startTime
  };

  if (violations.length > 0) {
    logger.info(
      `[Guardrails] Input check: ${violations.length} violation(s), passed=${result.passed}, ` +
      `types=${violations.map(v => v.type).join(',')}, processing=${result.processingMs}ms`
    );
  }

  return result;
};

/**
 * Validate output text (LLM response) through guardrails
 */
const validateOutput = (text: string): GuardrailResult => {
  const startTime = Date.now();
  const violations: GuardrailResult['violations'] = [];
  let sanitized = text;

  // 1. PII in output (LLM should not leak PII)
  for (const piiPattern of PII_PATTERNS) {
    const matches = text.match(piiPattern.pattern);
    if (matches) {
      violations.push({
        type: 'pii',
        severity: 'high',
        detail: `PII leaked in output: ${piiPattern.name}`
      });
      sanitized = sanitized.replace(piiPattern.pattern, piiPattern.replacement);
    }
  }

  // 2. Toxicity in output
  for (const toxPattern of TOXICITY_KEYWORDS) {
    if (toxPattern.test(text)) {
      violations.push({
        type: 'toxicity',
        severity: 'critical',
        detail: 'Harmful content in LLM output'
      });
      break;
    }
  }

  const hasCritical = violations.some(v => v.severity === 'critical' || v.severity === 'high');

  return {
    passed: !hasCritical,
    violations,
    sanitizedOutput: sanitized,
    processingMs: Date.now() - startTime
  };
};

/**
 * Full pipeline: validate input, sanitize, then validate output
 */
const validatePipeline = (input: string, output: string): {
  inputResult: GuardrailResult;
  outputResult: GuardrailResult;
  overallPassed: boolean;
} => {
  const inputResult = validateInput(input);
  const outputResult = validateOutput(output);

  return {
    inputResult,
    outputResult,
    overallPassed: inputResult.passed && outputResult.passed
  };
};

/**
 * Redact PII from text (for logging/storage)
 */
const redactPII = (text: string): string => {
  let redacted = text;
  for (const piiPattern of PII_PATTERNS) {
    redacted = redacted.replace(piiPattern.pattern, piiPattern.replacement);
  }
  return redacted;
};

export default {
  validateInput,
  validateOutput,
  validatePipeline,
  redactPII
};
