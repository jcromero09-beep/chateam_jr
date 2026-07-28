import { Request, Response } from "express";
import { Op } from "sequelize";
import AppError from "../errors/AppError";
import TicketTag from '../models/TicketTag';
import Tag from '../models/Tag'
import { getIO } from "../libs/socket";
import Ticket from "../models/Ticket";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { removeFollowupJobByTicketId, enqueueFollowupJob } from "../workers/stageClassifier.worker";
import { obtenerApiKeyPorTicketId } from "../services/IntegrationsServices/clasificarEtapaCliente";
import KanbanMovementLog from "../models/KanbanMovementLog";
// Sprint Kanban (2026-05-20): helper único para movimientos Kanban
// con side effects (followups + conversion CAPI). Ver docs/AI_MEMORY_CONTRACT.md.
import KanbanStageTransitionService from "../services/KanbanServices/KanbanStageTransitionService";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId: ticketIdParam, tagId: tagIdParam } = req.params;
  const ticketId = Number(ticketIdParam);
  const tagId = Number(tagIdParam);
  const { companyId } = req.user;

  try {
    // 1. Busca el Tag completo con scope multi-tenant
    const tag = await Tag.findOne({ where: { id: tagId, companyId } });
    if (!tag) {
      console.warn(`[TicketTag.store] Etiqueta no encontrada: tagId=${tagId}, companyId=${companyId}`);
      return res.status(404).json({ error: 'Etiqueta no encontrada.' });
    }

    // [W1-SEC-IDOR] TicketTag no tiene companyId → validar propiedad del ticket
    // ANTES de cualquier escritura (kanban o legacy). Impide adjuntar/mover tags
    // en tickets de otra empresa pasando su ticketId.
    const ownTicket = await Ticket.findOne({ where: { id: ticketId, companyId } });
    if (!ownTicket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    // 2. Si es un tag KANBAN → delegar al helper único.
    //    El helper se encarga de: limpiar otras etapas Kanban,
    //    crear/conservar el TicketTag, log de movimiento, followups y CAPI.
    if (tag.kanban > 0) {
      // Detectar si el usuario sobrescribe una clasificación IA reciente (<30min)
      // — esto se sigue capturando ANTES de delegar para enriquecer la metadata.
      let recentAIMove = null as any;
      try {
        recentAIMove = await KanbanMovementLog.findOne({
          where: {
            ticketId,
            companyId,
            movedBy: 'ai',
            createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) }
          },
          order: [['createdAt', 'DESC']]
        });
      } catch { /* silent */ }

      const result = await KanbanStageTransitionService.move({
        companyId,
        ticketId,
        toTagId: tagId,
        movedBy: 'user',
        userId: req.user?.id,
        source: 'manual_ui',
        reason: recentAIMove
          ? 'Usuario sobrescribió clasificación IA'
          : 'Asignación manual de etapa',
        // Manual desde UI → followups + conversion CAPI por contrato.
        triggerFollowups: true,
        triggerLeadConversion: false,
        conversionSource: 'kanban_label'
      });

      // Marcar wasOverriddenByUser si aplica (campo aparte en KanbanMovementLog).
      // Si hubo movimiento real y el helper creó el log, lo actualizamos
      // con la bandera de override IA. Si no hubo movimiento (ya estaba),
      // no tocamos nada.
      if (result.moved && result.movementLogId && recentAIMove) {
        try {
          await KanbanMovementLog.update(
            { wasOverriddenByUser: true },
            { where: { id: result.movementLogId } }
          );
        } catch { /* silent */ }
      }

      // 3. Recargar ticket y notificar por socket.
      // handleTagAssignment, llamado dentro del helper, ya cancela followups
      // previos antes de programar el nuevo. No borrar jobs aqui, porque se
      // eliminaria el followup recien creado.
      // FECHA SAGRADA: NO bumpear updatedAt al asignar etiquetas Kanban.
      // La fecha de la lista de tickets SOLO se mueve por mensaje nuevo
      // (CreateMessageService) o transferencia. Etiquetas/colas/citas/clicks
      // NO deben reordenar la lista. Solo recargamos y emitimos para reflejar
      // el tag en la UI, conservando el updatedAt original. (regresión 2026-06-16)
      const ticket = await ShowTicketService(ticketId, companyId);

      const io = getIO();
      io.of(String(companyId))
        .emit(`company-${companyId}-ticket`, {
          action: "update",
          ticket
        });

      // 5. Buscamos el TicketTag final para mantener compatibilidad de respuesta.
      const ticketTag = await TicketTag.findOne({ where: { ticketId, tagId } });
      return res.status(201).json(ticketTag || { ticketId, tagId });
    }

    // ─── TAG NO-KANBAN: ruta legacy (followup simple con tag.timeLane) ───
    // Mantenemos el comportamiento previo para no romper integraciones que
    // dependen de tags no-kanban (etiquetas internas, segmentación, etc.).
    const [ticketTag] = await TicketTag.findOrCreate({
      where: { ticketId, tagId },
      defaults: { ticketId, tagId }
    });

    await removeFollowupJobByTicketId(ticketId).catch(() => null);

    // FECHA SAGRADA: NO bumpear updatedAt al asignar etiquetas no-Kanban.
    // (regresión 2026-06-16) Ver nota en la rama Kanban.
    const ticket = await ShowTicketService(ticketId, companyId);

    const apiKey = await obtenerApiKeyPorTicketId(ticket.id);
    if (tag.timeLane && tag.greetingMessageLane && apiKey) {
      await enqueueFollowupJob({
        ticketId,
        tagId: tag.id,
        tagKey: tag.key,
        companyId,
        apiKey,
        contactName: "",
        conversationContext: '',
        currentFollowup: 1,
        followupMessage1: tag.greetingMessageLane,
        followupDelay1: tag.timeLane || 1,
        followupCount: 1
      });
    }

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });

    return res.status(201).json(ticketTag);
  } catch (error) {
    console.error(`[TicketTag.store] Error:`, error);
    return res.status(500).json({ error: 'Error al almacenar la etiqueta del ticket.' });
  }
};


/*
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;


  try {
    await TicketTag.destroy({ where: { ticketId } });
    return res.status(200).json({ message: 'Ticket tags removed successfully.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove ticket tags.' });
  }
};
*/
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;
  const { companyId } = req.user;


  try {
    const existingTicket = await Ticket.findOne({
      where: { id: Number(ticketId), companyId }
    });

    if (!existingTicket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    // Retrieve tagIds associated with the provided ticketId from TicketTags
    const ticketTags = await TicketTag.findAll({ where: { ticketId: Number(ticketId) } });
    const tagIds = ticketTags.map((ticketTag) => ticketTag.tagId);

    // Find the tagIds with kanban = 1 in the Tags table, scoped to companyId
    const tagsWithKanbanOne = await Tag.findAll({
      where: {
        id: tagIds,
        companyId,
        kanban: 1,
      },
    });

    // Remove the tagIds with kanban = 1 from TicketTags
    const tagIdsWithKanbanOne = tagsWithKanbanOne.map((tag) => tag.id);
    if (tagIdsWithKanbanOne.length > 0) {
      await TicketTag.destroy({
        where: { ticketId: Number(ticketId), tagId: tagIdsWithKanbanOne }
      });
    }

    // FECHA SAGRADA: NO bumpear updatedAt al eliminar etiquetas.
    // (regresión 2026-06-16) Ver nota en store().
    const ticket = await ShowTicketService(ticketId, companyId);

    const io = getIO();
    io.of(String(companyId))
      // .to(ticket.status)
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });
    return res.status(200).json({ message: 'Etiquetas de ticket eliminadas correctamente.' });
  } catch (error) {
    return res.status(500).json({ error: 'Error al eliminar etiquetas de ticket.' });
  }
};
