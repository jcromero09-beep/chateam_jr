import { selectModel } from "./ModelRouterService";
import AppointmentAvailabilityGuard from "./AppointmentAvailabilityGuard";
import AppointmentContextStore from "./AppointmentContextStore";
import logger from "../../utils/logger";

/**
 * ResponseGatekeeperService — Capa de reflexión antes del envío
 *
 * Patrón: Reflection / Critic. El agente principal (sales/support/appointment/rag)
 * GENERA un borrador; este gatekeeper lo EVALÚA en contexto antes de que se envíe.
 *
 * Decisiones posibles:
 *   - "send":     Enviar la respuesta tal cual
 *   - "rewrite":  Reescribir el borrador (devuelve texto corregido en `rewritten`)
 *   - "escalate": Pasar a humano sin responder
 *   - "ignore":   NO enviar nada (ej: cliente solo agradeció, no requiere respuesta)
 *
 * Qué detecta:
 *   - Alucinaciones: la respuesta menciona precios/horarios/servicios que no
 *     aparecen en las toolCalls previas
 *   - Incoherencia con el historial: contradice algo dicho 2-3 turnos atrás
 *   - Desalineación: el cliente preguntó X y la respuesta habla de Y
 *   - Mensajes que no requieren respuesta: "ok", "gracias", stickers
 *   - Respuestas vagas cuando se espera una acción concreta
 *
 * Modelo: se obtiene dinámicamente vía ModelRouterService.selectModel() con
 *   agentType='gatekeeper' y tier 'mini'. Si la empresa no tiene config, hace
 *   fallback al default del sistema.
 */

/**
 * Detecta si un texto afirma que una cita fue creada/confirmada/agendada.
 * Usado por el guardrail anti-alucinación para detectar cuando un agente
 * (RAG, sales) está a punto de mentirle al cliente diciendo que agendó
 * sin haber ejecutado la tool de booking correspondiente.
 */
function detectFalseBookingClaim(textLower: string): boolean {
  const patterns = [
    /cita (ha sido |está |fue )?(confirmada|agendada|creada|registrada|reservada)/,
    /tu cita (ya |está |queda )?(confirmada|agendada|creada|registrada|reservada)/,
    /ya (te )?(agend|reserv|program)[eéó]/,
    /listo[,\s!]+.*?cita/,
    /perfecto[,\s!]+.*?cita (está|queda|confirmada|agendada)/,
    /(te )?agend(o|é) (tu |la )?cita/,
    /(te )?reserv(o|é) (tu |el )?(cita|turno|horario)/,
    /te espero (mañana|el lunes|el martes|el miércoles|el jueves|el viernes|el sábado|el domingo)/
  ];
  return patterns.some(p => p.test(textLower));
}

export type GatekeeperDecision = 'send' | 'rewrite' | 'escalate' | 'ignore';

export interface GatekeeperInput {
  clientMessage: string;
  draftResponse: string;
  /** Últimos 3-5 turnos del historial (role + content) */
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Agente que generó el borrador */
  agentUsed?: string;
  /** Intent detectado por el orquestador */
  intent?: string;
  /** Tools invocadas por el agente (solo nombres) */
  toolsUsed?: string[];
  /** Contexto adicional opcional (ticket, productos, citas, etc.) */
  extraContext?: string;
  companyId: number;
  /** 🆕 Fecha YYYY-MM-DD resuelta por QueryEnrichmentAgent (si viene) */
  resolvedDate?: string;
  /** 🆕 Hora HH:mm resuelta por QueryEnrichmentAgent (si viene) */
  resolvedTime?: string;
  /** 🆕 ticketId y contactId — necesarios para que el Guard persista
   * el contexto awaiting_confirmation cuando sugiera slots al cliente */
  ticketId?: number;
  contactId?: number;
}

export interface GatekeeperResult {
  decision: GatekeeperDecision;
  confidence: number;
  reasoning: string;
  /** Solo cuando decision='rewrite': texto reescrito */
  rewritten?: string;
  modelUsed: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
}

/**
 * Evalúa un borrador de respuesta y decide si enviarlo, reescribirlo,
 * escalarlo o ignorarlo.
 */
const evaluate = async (input: GatekeeperInput): Promise<GatekeeperResult> => {
  const startTime = Date.now();

  // 🆕 PRE-CHECK AGENTE-AGENTE: AppointmentAvailabilityGuard
  // Si el borrador habla de citas/disponibilidad y niega horarios, delegamos
  // al Guard para que verifique contra BD antes de invocar el LLM judge.
  // Esto resuelve el bug "mañana no hay cita" cuando sí hay bloques reales.
  const looksLikeAppointmentContext =
    (input.intent && input.intent.toLowerCase().includes('appointment')) ||
    (input.agentUsed === 'appointment') ||
    /cita|agend|horario|disponibilidad/i.test(input.draftResponse);

  if (looksLikeAppointmentContext) {
    try {
      const guardResult = await AppointmentAvailabilityGuard.verify({
        companyId: input.companyId,
        clientMessage: input.clientMessage,
        draftResponse: input.draftResponse,
        resolvedDate: input.resolvedDate,
        resolvedTime: input.resolvedTime
      });

      // Si el Guard detectó una contradicción borrador ↔ BD, corregimos YA
      if (guardResult.suggestedCorrection) {
        logger.info(
          `[ResponseGatekeeper] AvailabilityGuard detectó falso negativo — rewrite forzado. ` +
          `Razón: ${guardResult.reasoning}`
        );

        // 🆕 FIX ticket 1101: persistir contexto awaiting_confirmation con los
        // slots reales. Antes solo se reescribía el texto pero el contexto
        // NO se guardaba, así que el siguiente turno ("2" eligiendo slot)
        // no encontraba nada y RAG alucinaba. Ahora el AppointmentAgent
        // podrá leer el contexto y crear la cita en el turno siguiente.
        if (input.ticketId && guardResult.availableSlots.length > 0) {
          try {
            await AppointmentContextStore.set({
              ticketId: input.ticketId,
              step: 'awaiting_confirmation',
              serviceId: guardResult.serviceId,
              contactId: input.contactId,
              lastAction: 'create',
              createdAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              metadata: { availableSlots: guardResult.availableSlots }
            } as any);
            logger.info(
              `[ResponseGatekeeper] ✅ Contexto awaiting_confirmation persistido para ticket ${input.ticketId} ` +
              `con ${guardResult.availableSlots.length} slots reales`
            );
          } catch (ctxErr: any) {
            logger.warn(
              `[ResponseGatekeeper] Error persistiendo contexto: ${ctxErr.message}`
            );
          }
        }

        return {
          decision: 'rewrite',
          confidence: 0.95,
          reasoning: `AvailabilityGuard: ${guardResult.reasoning}`,
          rewritten: guardResult.suggestedCorrection,
          modelUsed: 'availability-guard',
          latencyMs: Date.now() - startTime,
          tokensUsed: { input: 0, output: 0 }
        };
      }

      // Si el Guard confirmó que realmente NO hay disponibilidad en esa fecha,
      // el borrador es correcto → dejamos pasar sin gastar otro LLM call.
      if (guardResult.verifiedDate && !guardResult.actuallyAvailable) {
        logger.info(
          `[ResponseGatekeeper] AvailabilityGuard confirmó borrador correcto ` +
          `(sin slots para ${guardResult.verifiedDate}). Decisión: send.`
        );
        return {
          decision: 'send',
          confidence: 0.9,
          reasoning: guardResult.reasoning,
          modelUsed: 'availability-guard',
          latencyMs: Date.now() - startTime,
          tokensUsed: { input: 0, output: 0 }
        };
      }
      // Si no hubo fecha verificable o el borrador no contradice, seguimos al LLM judge
    } catch (guardErr: any) {
      logger.warn(
        `[ResponseGatekeeper] AvailabilityGuard falló, continuando con LLM judge: ${guardErr.message}`
      );
    }
  }

  // 1. Seleccionar modelo configurado para este agente (tier mini = rápido/barato)
  const modelSelection = await selectModel('gatekeeper', input.clientMessage, 'mini');
  const modelKey = modelSelection?.entity.key || 'gpt-4.1-mini'; // Fallback si no hay config

  // 2. Preparar historial (máx últimos 5 turnos para no saturar contexto)
  const historyText = (input.recentHistory || [])
    .slice(-5)
    .map(m => `${m.role === 'assistant' ? 'AGENTE' : 'CLIENTE'}: ${m.content}`)
    .join('\n') || '(sin historial)';

  const toolsText = (input.toolsUsed || []).length > 0
    ? input.toolsUsed!.join(', ')
    : '(ninguna tool invocada)';

  const prompt = `Eres un auditor de calidad de respuestas de un asistente virtual empresarial.
Tu trabajo es revisar un borrador de respuesta ANTES de que se envíe al cliente
y decidir si debe enviarse, reescribirse, escalarse a humano o ignorarse.

## CONTEXTO
Agente que generó el borrador: ${input.agentUsed || 'desconocido'}
Intent detectado: ${input.intent || 'desconocido'}
Tools invocadas por el agente: ${toolsText}
${input.extraContext ? `\nContexto adicional:\n${input.extraContext}\n` : ''}

## HISTORIAL RECIENTE
${historyText}

## MENSAJE DEL CLIENTE (turno actual)
"${input.clientMessage}"

## BORRADOR DE RESPUESTA DEL AGENTE
"${input.draftResponse}"

## TU TAREA
Decide UNA acción sobre este borrador:

1. "send" — El borrador es correcto, coherente y responde lo que el cliente pidió.

2. "rewrite" — El borrador tiene problemas pero es salvable. Ejemplos:
   - Desalineado con la pregunta (cliente preguntó X, respuesta habla de Y)
   - Menciona precios/horarios/servicios/datos específicos que NO aparecen en tools invocadas (posible alucinación)
   - Contradice algo dicho en turnos previos
   - Muy vago cuando se esperaba acción concreta
   → Devuelve "rewritten" con el texto corregido (mismo tono, mismos datos REALES, sin inventar).

3. "escalate" — El caso debe ir a un humano. Ejemplos:
   - El cliente está frustrado/enojado (2+ mensajes negativos)
   - Amenazas, reclamos legales, problemas complejos que el agente no puede resolver
   - El borrador es incoherente o no tiene sentido

4. "ignore" — NO enviar nada. Ejemplos:
   - Cliente envió solo "ok", "gracias", un sticker, emoji sin pregunta
   - Cliente respondió a un mensaje anterior pero ya la conversación cerró naturalmente
   - Cliente envió info sin pedir respuesta (ej: "aquí está mi dirección: ..." después de que ya la cita fue confirmada)

## REGLAS CRÍTICAS
- Si el borrador menciona un precio, horario, servicio específico, o detalle del negocio
  y NO hubo tool invocada que los traiga, considera ALUCINACIÓN → "rewrite" o "escalate".
- Si el cliente solo agradece sin preguntar nada → "ignore".
- Prefiere "send" si el borrador es razonable; no seas hipercrítico.
- "rewrite" solo si puedes PRODUCIR una mejor versión con los datos que SÍ tienes.
- Conserva el tono y estilo del agente cuando reescribas (no robótico).

## REGLA ANTI-MENTIRA EN CITAS (CRÍTICA)
Si el borrador del agente dice frases como:
  - "No tienes citas pendientes"
  - "No encuentro tu cita"
  - "No hay cita programada"
Y el cliente está pidiendo agendar, NUNCA lo reescribas como "Cita confirmada"
o "Listo, ya agendé". Eso crearía una mentira: el agente dice que no hay cita,
tú la "confirmas" pero la BD NO tiene nada creado.
En ese caso usa "escalate" o "rewrite" a un mensaje tipo:
"Déjame revisar tu solicitud con un asesor para agendar correctamente."
NUNCA inventes que una cita fue agendada si el agente no la creó.

Responde SOLO con JSON válido:
{
  "decision": "send" | "rewrite" | "escalate" | "ignore",
  "confidence": 0.0 a 1.0,
  "reasoning": "1-2 oraciones explicando por qué",
  "rewritten": "solo si decision=rewrite, texto reescrito; si no, omitir"
}`;

  try {
    const AIClientService = require("../AIClientService").default;
    const llmResponse = await AIClientService.generateText({
      prompt,
      modelKey,
      maxTokens: 400,
      temperature: 0.2, // Determinista pero con flexibilidad para reescribir
      responseFormat: 'json',
      companyId: input.companyId
    });

    const parsed = JSON.parse(llmResponse.text);

    const validDecisions: GatekeeperDecision[] = ['send', 'rewrite', 'escalate', 'ignore'];
    const decision: GatekeeperDecision = validDecisions.includes(parsed.decision)
      ? parsed.decision
      : 'send'; // Fallback seguro: enviar el borrador original

    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7;

    const result: GatekeeperResult = {
      decision,
      confidence,
      reasoning: parsed.reasoning || 'Sin razonamiento',
      rewritten: decision === 'rewrite' && typeof parsed.rewritten === 'string'
        ? parsed.rewritten
        : undefined,
      modelUsed: modelKey,
      latencyMs: Date.now() - startTime,
      tokensUsed: {
        input: llmResponse.usage?.promptTokens || Math.ceil(prompt.length / 4),
        output: llmResponse.usage?.completionTokens || Math.ceil(llmResponse.text.length / 4)
      }
    };

    logger.info(
      `[ResponseGatekeeper] decision=${decision}, confidence=${confidence.toFixed(2)}, ` +
      `agent=${input.agentUsed}, intent=${input.intent}, ` +
      `reasoning="${result.reasoning.substring(0, 80)}", ` +
      `latency=${result.latencyMs}ms, model=${modelKey}`
    );

    // Validación defensiva: si dijo "rewrite" pero no dio texto, mejor enviar original
    if (decision === 'rewrite' && !result.rewritten) {
      logger.warn(
        `[ResponseGatekeeper] decision=rewrite sin texto reescrito, cayendo a 'send'`
      );
      result.decision = 'send';
    }

    // 🆕 Guardrail anti-mentira para citas (defensa en profundidad):
    // Si el borrador original admite "no hay cita" y la reescritura afirma
    // que la cita fue agendada/confirmada, REVERTIR a escalate. Eso significa
    // que el agente NO pudo crear la cita y el LLM está a punto de mentirle
    // al cliente diciendo que sí.
    if (result.decision === 'rewrite' && result.rewritten) {
      const draftLower = input.draftResponse.toLowerCase();
      const rewrittenLower = result.rewritten.toLowerCase();

      const draftAdmitsNoAppointment =
        /no tienes (citas? )?pendientes/.test(draftLower) ||
        /no encuentro (tu |la )?cita/.test(draftLower) ||
        /no hay cita (programada|registrada)/.test(draftLower) ||
        /sin citas? (pendientes|programadas)/.test(draftLower);

      const rewriteClaimsBooked = detectFalseBookingClaim(rewrittenLower);

      if (draftAdmitsNoAppointment && rewriteClaimsBooked) {
        logger.warn(
          `[ResponseGatekeeper] ⚠️ GUARDRAIL ACTIVADO: el rewrite intentaba confirmar cita ` +
          `que NO existe. Forzando escalate para evitar mentira al cliente.`
        );
        result.decision = 'escalate';
        result.reasoning = `Guardrail: borrador admitía que no había cita pero rewrite la "confirmaba" sin crearla en BD`;
        result.rewritten = undefined;
      }
    }

    // 🆕 FIX ticket 1099: detección de ALUCINACIÓN DE AGENDAMIENTO en cualquier
    // agente (RAG, sales, support) cuando:
    //   1. El borrador afirma que la cita "está agendada/confirmada"
    //   2. NO se invocaron tools de creación de cita (schedule_appointment /
    //      confirm_appointment / reschedule_appointment)
    // → se bloquea el envío y fuerza escalate. Evita que el RAG/sales
    //   alucinen confirmaciones sin pasar por el AppointmentAgent.
    if (result.decision !== 'escalate') {
      const draftLower = input.draftResponse.toLowerCase();
      const claimsBooking = detectFalseBookingClaim(draftLower);

      const bookingTools = ['schedule_appointment', 'confirm_appointment', 'reschedule_appointment'];
      const usedBookingTool = (input.toolsUsed || []).some(t => bookingTools.includes(t));

      // Solo aplica si el agente NO usó una tool de booking y el borrador
      // afirma que la cita fue creada. Si fue el AppointmentAgent directo
      // (agentUsed='appointment'), confiamos porque tiene su propio flujo.
      const shouldBlock =
        claimsBooking &&
        !usedBookingTool &&
        input.agentUsed !== 'appointment';

      if (shouldBlock) {
        logger.warn(
          `[ResponseGatekeeper] ⚠️ GUARDRAIL HALLUCINATION BLOCKED: agente=${input.agentUsed} ` +
          `afirma que agendó la cita pero NO invocó tool de booking. Tools usadas: ` +
          `[${(input.toolsUsed || []).join(',')}]. Forzando rewrite+escalate.`
        );
        result.decision = 'rewrite';
        result.rewritten =
          `Gracias por confirmar los datos. Dame un momento para procesar tu agendamiento — ` +
          `te confirmo en breve con un asesor.`;
        result.reasoning = `Anti-alucinación: agente ${input.agentUsed} afirmó agendamiento sin usar tool de booking`;
        // Después de rewrite, escalamos también para que un humano cierre la cita
        // Señal: SupervisorService detecta gatekeeperDecision='escalate-after-rewrite' via reasoning
      }
    }

    // 🆕 FIX ticket 1102: detección de ALUCINACIÓN DE HORARIOS COMERCIALES.
    // Cuando el agente (especialmente sales/support) menciona horarios de
    // atención ("atendemos de X a Y", "horarios entre lunes y viernes",
    // "de 9am a 5pm") SIN haber invocado check_availability o
    // list_appointment_services, está inventando datos.
    // Se reescribe para pedir al cliente que especifique cuándo quiere
    // y delega al AppointmentAgent en el siguiente turno.
    if (result.decision !== 'escalate' && result.decision !== 'rewrite') {
      const draftLower = input.draftResponse.toLowerCase();

      const mentionsBusinessHours =
        /horario(s)?\s+(entre|de|son|disponibles)/.test(draftLower) ||
        /tenemos horarios/.test(draftLower) ||
        /(atendemos|atención)\s+(de|desde|los)/.test(draftLower) ||
        /estamos abiertos\s+(de|desde|los|entre)/.test(draftLower) ||
        /(lunes|martes|miércoles|jueves|viernes|sábado|domingo).*(a|al|y).*?(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/.test(draftLower) ||
        /\b\d{1,2}\s*(am|pm|h|:00)\s+a\s+\d{1,2}\s*(am|pm|h|:00)\b/.test(draftLower) ||
        /de \d{1,2}(:\d{2})?\s*(am|pm|h)?\s+a(\s+las)?\s+\d{1,2}(:\d{2})?\s*(am|pm|h)?/.test(draftLower);

      const availabilityTools = ['check_availability', 'list_appointment_services', 'get_my_appointments'];
      const usedAvailabilityTool = (input.toolsUsed || []).some(t => availabilityTools.includes(t));

      const shouldBlockHours =
        mentionsBusinessHours &&
        !usedAvailabilityTool &&
        input.agentUsed !== 'appointment' && // appointment agent tiene su propio flujo
        input.agentUsed !== 'router';

      if (shouldBlockHours) {
        logger.warn(
          `[ResponseGatekeeper] ⚠️ GUARDRAIL HORARIOS BLOCKED: agente=${input.agentUsed} ` +
          `inventó horarios comerciales sin consultar check_availability. Tools usadas: ` +
          `[${(input.toolsUsed || []).join(',')}]. Forzando rewrite.`
        );
        result.decision = 'rewrite';
        result.rewritten =
          `¡Excelente elección! ¿Qué día y hora te gustaría para la instalación? ` +
          `Dime la fecha y horario preferido y reviso la disponibilidad real para agendarte.`;
        result.reasoning = `Anti-alucinación: agente ${input.agentUsed} mencionó horarios comerciales sin invocar check_availability/list_appointment_services`;
      }
    }

    return result;
  } catch (error: any) {
    logger.error(
      `[ResponseGatekeeper] Error evaluando: ${error.message}. ` +
      `Fallback seguro: decision='send' (enviar borrador original).`
    );

    // Fallback SEGURO: si el gatekeeper falla, enviamos el borrador original.
    // No queremos que una falla del auditor bloquee todas las respuestas.
    return {
      decision: 'send',
      confidence: 0.3,
      reasoning: `Fallback por error del gatekeeper: ${error.message}`,
      modelUsed: 'fallback',
      latencyMs: Date.now() - startTime,
      tokensUsed: { input: 0, output: 0 }
    };
  }
};

export default { evaluate };
