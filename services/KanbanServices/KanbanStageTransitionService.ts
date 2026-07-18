/**
 * KanbanStageTransitionService — Helper único para mover un ticket entre
 * etapas Kanban respetando el contrato de docs/AI_MEMORY_CONTRACT.md.
 *
 * Reemplaza la lógica dispersa que vivía en:
 *   - controllers/TicketTagController.ts (cambios manuales desde UI)
 *   - services/AIAgentServices/SupervisorActionsService.ts (clasificación
 *     del orquestador post-envío)
 *   - workers/stageClassifier.worker.ts (clasificación avanzada con LLM)
 *   - services/AIAgentServices/ToolRegistry.ts (tool `move_ticket_to_stage`)
 *
 * Garantías que aporta:
 *   1. Validación multi-tenant: el `Tag` destino debe pertenecer a `companyId`
 *      y tener `kanban > 0`. Si no, rechaza sin tocar nada.
 *   2. Una sola etapa Kanban activa a la vez: elimina otras etapas Kanban
 *      del ticket.
 *   3. Crea o conserva el `TicketTag` destino sin duplicar filas.
 *   4. Registra `KanbanMovementLog` solo cuando hubo movimiento REAL
 *      (cambio de etapa). Si el ticket ya estaba en esa etapa, no registra.
 *   5. Ejecuta `handleTagAssignment` (followups) SOLO cuando entra por primera
 *      vez a la etapa. Idempotente: si el `TicketTag` ya existía, no programa
 *      followups de nuevo.
 *   6. Dispara `sendKanbanLeadConversionFromTagAssignmentAsync` cuando
 *      `triggerLeadConversion=true`. Confía en la deduplicación interna del
 *      servicio CAPI por `(companyId, contactId, kanbanKey, Lead)`.
 *   7. Nunca bloquea por errores de CAPI / followups / Zep. Devuelve resultado
 *      descriptivo para el caller.
 *
 * Lo que NO hace:
 *   - No envía mensajes al cliente.
 *   - No emite socket.io (lo hace el caller si corresponde).
 *   - No escribe en Zep directamente; Zep se alimenta de mensajes del ticket.
 *   - No mueve etapas si el `Tag` no es Kanban (`kanban===0` o sin `companyId`).
 *
 * Contrato de movedBy (`KanbanMovementLog.movedBy` solo acepta 3 valores en BD):
 *   - "ai"     → cualquier origen IA: orquestador, classifier, tool, cron de IA
 *   - "user"   → acción humana directa
 *   - "system" → cron, jobs, migración, integración externa
 * El detalle fino del origen va en `metadata.source` para mantener trazabilidad
 * sin romper el esquema BD (BD SAGRADA).
 */

import { Op, Transaction } from "sequelize";
import sequelize from "../../database";
import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import KanbanMovementLog from "../../models/KanbanMovementLog";
import logger from "../../utils/logger";
import { sendKanbanLeadConversionFromTagAssignmentAsync } from "../FacebookConversionService/KanbanLeadConversionService";
import { dispatchKanbanCustomConversionAsync } from "../FacebookConversionService/KanbanCustomConversionDispatchService";
import { shouldSendMetaConversion } from "../FacebookConversionService/MetaConversionPolicyService";

const PREFIX = "[KanbanStageTransition]";

// ─────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────

export type MovedBy = "ai" | "user" | "system" | "cron";

export interface KanbanStageTransitionInput {
  companyId: number;
  ticketId: number;
  /** Destino: o `toTagId` numérico o `toTagKey` string (ej: "interest"). */
  toTagId?: number;
  toTagKey?: string;
  /**
   * Origen del movimiento. `cron` se mapea a `system` al persistir en
   * `KanbanMovementLog.movedBy` (que solo acepta system|user|ai) pero queda
   * fielmente en `metadata.source`.
   */
  movedBy: MovedBy;
  userId?: number;
  /** Etiqueta fina del origen (ej: `orchestrator_reply_sent_whatsapp`). */
  source?: string;
  /** Razón humana para el log (1 línea). */
  reason?: string;
  /** Programar followups (handleTagAssignment). Default: true cuando hay movimiento. */
  triggerFollowups?: boolean;
  /** Disparar Lead CAPI (incluso si el ticket ya estaba en la etapa). Default: false. */
  triggerLeadConversion?: boolean;
  /**
   * Disparar la conversión personalizada Meta del tag (dispatcher genérico).
   * Default: true. Solo se envía en movimiento REAL y si el tag tiene
   * `sendMetaConversion=true` + config válida. Pasar `false` para suprimirlo.
   */
  triggerMetaConversion?: boolean;
  /** Override del `source` que se envía al servicio CAPI. */
  conversionSource?: string;
  /** Métricas opcionales del clasificador IA — solo se persisten si vienen. */
  aiConfidence?: number;
  aiModelUsed?: string;
}

export interface KanbanStageTransitionResult {
  /** true si hubo movimiento real (cambio de tag o entrada nueva). */
  moved: boolean;
  /** true si el ticket ya estaba en la etapa destino. */
  alreadyInStage: boolean;
  /** Estado final del ticket en Kanban. */
  toTagId: number | null;
  toTagKey: string | null;
  /** Etiqueta Kanban anterior si la había (la primera encontrada distinta). */
  fromTagId: number | null;
  /** true si se ejecutó handleTagAssignment. */
  followupsTriggered: boolean;
  /** true si se encoló el envío Lead CAPI (siempre que triggerLeadConversion=true). */
  leadConversionQueued: boolean;
  /** true si se encoló la conversión personalizada Meta del tag. */
  metaConversionQueued: boolean;
  /** Motivo cuando no se pudo mover (tag inexistente, otra company, etc.). */
  skippedReason?:
    | "tag_not_found"
    | "tag_not_kanban"
    | "tag_other_company"
    | "no_tag_input"
    | "error";
  /** id del KanbanMovementLog creado (solo si moved=true). */
  movementLogId?: number;
  /** Mensaje de error si hubo fallo no esperado. */
  errorMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Helpers internos
// ─────────────────────────────────────────────────────────────────────

const mapMovedByForLog = (movedBy: MovedBy): "ai" | "user" | "system" => {
  if (movedBy === "ai" || movedBy === "user") return movedBy;
  return "system"; // cron + system → system en BD
};

const buildSkipResult = (
  reason: KanbanStageTransitionResult["skippedReason"],
  fromTagId: number | null
): KanbanStageTransitionResult => ({
  moved: false,
  alreadyInStage: false,
  toTagId: null,
  toTagKey: null,
  fromTagId,
  followupsTriggered: false,
  leadConversionQueued: false,
  metaConversionQueued: false,
  skippedReason: reason
});

/**
 * Carga las etapas Kanban actualmente activas del ticket y devuelve:
 *   - tags actuales con su Tag
 *   - el primer `fromTagId` candidato (excluyendo el destino) para el log
 */
const loadCurrentKanbanTags = async (
  ticketId: number,
  companyId: number,
  excludeTagId?: number,
  transaction?: Transaction
): Promise<{
  rows: Array<{ tagId: number; tag: Tag }>;
  fromTagId: number | null;
}> => {
  const rows = await TicketTag.findAll({
    where: { ticketId },
    include: [
      {
        model: Tag,
        as: "tag",
        where: { companyId, kanban: { [Op.gt]: 0 } },
        required: true
      }
    ],
    order: [["createdAt", "DESC"]],
    transaction
  });

  const list = (rows as any[]).map(r => ({ tagId: r.tagId, tag: r.tag as Tag }));
  const fromTagId = list.find(r => r.tagId !== excludeTagId)?.tagId ?? null;
  return { rows: list, fromTagId };
};

const triggerLeadConversionIfWanted = async (
  input: KanbanStageTransitionInput,
  tagId: number
): Promise<boolean> => {
  if (!input.triggerLeadConversion) return false;
  const policy = await shouldSendMetaConversion({
    companyId: input.companyId,
    eventKey: "kanban_legacy_lead"
  });
  if (!policy.enabled) {
    logger.info(
      `${PREFIX} lead_policy_disabled ticket=${input.ticketId} tag=${tagId} ` +
      `company=${input.companyId} reason=${policy.reason || "disabled"}`
    );
    return false;
  }

  try {
    sendKanbanLeadConversionFromTagAssignmentAsync({
      companyId: input.companyId,
      ticketId: input.ticketId,
      tagId,
      source: input.conversionSource || input.source || "kanban_label",
      userId: input.userId
    });
    return true;
  } catch (err: any) {
    logger.warn(
      `${PREFIX} no se pudo encolar Lead CAPI (silenciado) ` +
      `ticket=${input.ticketId} tag=${tagId}: ${err?.message || err}`
    );
    return false;
  }
};

const triggerMetaConversionIfWanted = async (
  input: KanbanStageTransitionInput,
  tagId: number
): Promise<boolean> => {
  // Default true: cualquier movimiento real puede disparar la conversión
  // personalizada. El gate real (sendMetaConversion + config) vive en el
  // dispatcher, que no envía nada si el tag no está configurado.
  if (input.triggerMetaConversion === false) return false;
  const policy = await shouldSendMetaConversion({
    companyId: input.companyId,
    eventKey: "kanban_custom_conversion"
  });
  if (!policy.enabled) {
    logger.info(
      `${PREFIX} meta_conversion_policy_disabled ticket=${input.ticketId} tag=${tagId} ` +
      `company=${input.companyId} reason=${policy.reason || "disabled"}`
    );
    return false;
  }

  try {
    dispatchKanbanCustomConversionAsync({
      companyId: input.companyId,
      ticketId: input.ticketId,
      tagId,
      source: input.conversionSource || input.source || "kanban_custom_conversion",
      userId: input.userId
    });
    return true;
  } catch (err: any) {
    logger.warn(
      `${PREFIX} no se pudo encolar conversión Meta (silenciado) ` +
      `ticket=${input.ticketId} tag=${tagId}: ${err?.message || err}`
    );
    return false;
  }
};

const triggerFollowupsIfWanted = async (
  input: KanbanStageTransitionInput,
  tag: Tag,
  isFirstEntry: boolean
): Promise<boolean> => {
  // Reglas:
  //   - Solo programar followups en la PRIMERA entrada a la etapa.
  //   - Si el tag NO es Kanban (kanban===0), no programar (legacy se delega
  //     a otros entrypoints específicos).
  //   - Si triggerFollowups vino explícitamente en `false`, respetar.
  const shouldRun = isFirstEntry && tag.kanban > 0 && input.triggerFollowups !== false;
  if (!shouldRun) return false;
  try {
    const mod = await import("../../workers/stageClassifier.worker");
    const fn = (mod as any).handleTagAssignment ||
      (mod as any).default?.handleTagAssignment;
    if (typeof fn !== "function") return false;
    await fn(input.ticketId, tag.id, input.companyId);
    return true;
  } catch (err: any) {
    logger.warn(
      `${PREFIX} handleTagAssignment falló (silenciado) ` +
      `ticket=${input.ticketId} tag=${tag.id}: ${err?.message || err}`
    );
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────

export const move = async (
  input: KanbanStageTransitionInput
): Promise<KanbanStageTransitionResult> => {
  try {
    if (!input.companyId || !input.ticketId) {
      return buildSkipResult("no_tag_input", null);
    }
    if (!input.toTagId && !input.toTagKey) {
      return buildSkipResult("no_tag_input", null);
    }

    // 1) Resolver el Tag destino con scoping de companyId.
    const tagWhere: any = { companyId: input.companyId };
    if (input.toTagId) tagWhere.id = input.toTagId;
    if (input.toTagKey) tagWhere.key = input.toTagKey;

    const tag = await Tag.findOne({ where: tagWhere });
    if (!tag) {
      // ¿Existe el tag en otra company? Lo separamos para mensaje claro.
      if (input.toTagId) {
        const cross = await Tag.findOne({
          where: { id: input.toTagId },
          attributes: ["id", "companyId"]
        });
        if (cross) {
          logger.warn(
            `${PREFIX} 🚫 tag_other_company ticket=${input.ticketId} ` +
            `tagId=${input.toTagId} ownedBy=${cross.companyId} requesterCompany=${input.companyId}`
          );
          return buildSkipResult("tag_other_company", null);
        }
      }
      logger.info(
        `${PREFIX} tag_not_found ticket=${input.ticketId} ` +
        `companyId=${input.companyId} toTagId=${input.toTagId ?? "?"} toTagKey=${input.toTagKey ?? "?"}`
      );
      return buildSkipResult("tag_not_found", null);
    }

    if (!tag.kanban || tag.kanban <= 0) {
      logger.info(
        `${PREFIX} tag_not_kanban ticket=${input.ticketId} ` +
        `tagId=${tag.id} key=${tag.key} kanban=${tag.kanban}`
      );
      return buildSkipResult("tag_not_kanban", null);
    }

    // 2) Cargar etapas Kanban actuales.
    const { rows: currentKanbanTags, fromTagId } = await loadCurrentKanbanTags(
      input.ticketId,
      input.companyId,
      tag.id
    );

    const alreadyInStage = currentKanbanTags.some(r => r.tagId === tag.id);
    const otherKanbanIds = currentKanbanTags
      .filter(r => r.tagId !== tag.id)
      .map(r => r.tagId);

    // 3) Si ya está en la etapa, NO crear/log/handleTagAssignment.
    //    El caller PUEDE pedir CAPI igual (idempotente vía dedupe interno).
    if (alreadyInStage) {
      const leadQueued = await triggerLeadConversionIfWanted(input, tag.id);
      logger.info(
        `${PREFIX} already_in_stage ticket=${input.ticketId} tag=${tag.id}(${tag.key}) ` +
        `lead_queued=${leadQueued}`
      );
      // Misma etapa → NO se dispara conversión personalizada Meta (no duplica).
      return {
        moved: false,
        alreadyInStage: true,
        toTagId: tag.id,
        toTagKey: tag.key,
        fromTagId,
        followupsTriggered: false,
        leadConversionQueued: leadQueued,
        metaConversionQueued: false
      };
    }

    // 4-6) Movimiento canonico en transaccion: limpiar etapa anterior,
    // crear/conservar destino y registrar auditoria deben confirmarse juntos.
    const movementLogId = await sequelize.transaction(async transaction => {
      if (otherKanbanIds.length > 0) {
        // Validamos que esas filas también pertenezcan a la company. El SELECT
        // anterior ya filtró, pero el DELETE va por id de junction. Para evitar
        // borrar TicketTags de un ticket compartido (no debería darse), el
        // `ticketId` ya alcanza por el FK; la validación de company se hizo en
        // el include.
        await TicketTag.destroy({
          where: { ticketId: input.ticketId, tagId: { [Op.in]: otherKanbanIds } },
          transaction
        });
      }

      // Crear el TicketTag destino (findOrCreate por si hay race).
      await TicketTag.findOrCreate({
        where: { ticketId: input.ticketId, tagId: tag.id },
        defaults: { ticketId: input.ticketId, tagId: tag.id },
        transaction
      });

      // Registrar KanbanMovementLog. Si falla, la transaccion revierte el
      // cambio de TicketTag para no dejar etapa sin auditoria canonica.
      const logRow = await KanbanMovementLog.create({
        ticketId: input.ticketId,
        companyId: input.companyId,
        fromTagId,
        toTagId: tag.id,
        movedBy: mapMovedByForLog(input.movedBy),
        userId: input.userId ?? null,
        reason: (input.reason || `Transición a ${tag.key}`).slice(0, 255),
        metadata: {
          source: input.source || "kanban_stage_transition",
          movedByRaw: input.movedBy
        },
        aiConfidence: input.aiConfidence ?? null,
        aiModelUsed: input.aiModelUsed ?? null
      } as any, { transaction });

      return logRow.id;
    });

    // 7) Followups (solo primera entrada — y como llegamos hasta aquí, lo es).
    const followupsTriggered = await triggerFollowupsIfWanted(input, tag, true);

    // 8) Lead CAPI (opt-in del caller — sigue en false por defecto).
    const leadConversionQueued = await triggerLeadConversionIfWanted(input, tag.id);

    // 9) Conversión personalizada Meta del tag (default on, solo en movimiento real).
    const metaConversionQueued = await triggerMetaConversionIfWanted(input, tag.id);

    logger.info(
      `${PREFIX} ✅ moved ticket=${input.ticketId} ` +
      `${fromTagId || "(sin etapa)"} → ${tag.id}(${tag.key}) ` +
      `by=${input.movedBy} source=${input.source || "-"} ` +
      `followups=${followupsTriggered} lead=${leadConversionQueued} metaConv=${metaConversionQueued} logId=${movementLogId || "-"}`
    );

    return {
      moved: true,
      alreadyInStage: false,
      toTagId: tag.id,
      toTagKey: tag.key,
      fromTagId,
      followupsTriggered,
      leadConversionQueued,
      metaConversionQueued,
      movementLogId
    };
  } catch (error: any) {
    logger.error(
      `${PREFIX} error inesperado ticket=${input.ticketId} ` +
      `company=${input.companyId}: ${error?.message || error}`
    );
    return {
      ...buildSkipResult("error", null),
      errorMessage: error?.message || String(error)
    };
  }
};

export default { move };
