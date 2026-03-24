import { Request, Response } from "express";
import { Op } from "sequelize";
import AppError from "../errors/AppError";
import TicketTag from '../models/TicketTag';
import Tag from '../models/Tag'
import { getIO } from "../libs/socket";
import Ticket from "../models/Ticket";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import { removeFollowupJobByTicketId, enqueueFollowupJob, handleTagAssignment } from "../workers/stageClassifier.worker";
import { obtenerApiKeyPorTicketId } from "../services/IntegrationsServices/clasificarEtapaCliente";
import KanbanMovementLog from "../models/KanbanMovementLog";
export const store = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId: ticketIdParam, tagId: tagIdParam } = req.params;
  const ticketId = Number(ticketIdParam);
  const tagId = Number(tagIdParam);
  const { companyId } = req.user;

  try {
    //console.log(`[TicketTag.store] Creando nueva etiqueta: ticketId=${ticketId}, tagId=${tagId}, companyId=${companyId}`);

    // 1. Crea el nuevo registro o encuentra el existente (evita error de llave duplicada)
    const [ticketTag, created] = await TicketTag.findOrCreate({
      where: { ticketId, tagId },
      defaults: { ticketId, tagId }
    });
    //console.log(`[TicketTag.store] Registro TicketTag ${created ? 'creado' : 'ya existía'}: ticketId=${ticketId}, tagId=${tagId}`);

    // 2. Busca el Tag completo
    const tag = await Tag.findOne({ where: { id: tagId, companyId } });
    if (!tag) {
      console.warn(`[TicketTag.store] Etiqueta no encontrada: tagId=${tagId}, companyId=${companyId}`);
      return res.status(404).json({ error: 'Etiqueta no encontrada.' });
    }
    //console.log(`[TicketTag.store] Tag recuperado: key=${tag.key}, timeLane=${tag.timeLane}, greetingMessageLane=${!!tag.greetingMessageLane}`);

    // Detectar si el usuario está sobrescribiendo una clasificación IA reciente (<30min)
    try {
      const recentAIMove = await KanbanMovementLog.findOne({
        where: {
          ticketId,
          companyId,
          movedBy: 'ai',
          createdAt: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) }
        },
        order: [['createdAt', 'DESC']]
      });

      await KanbanMovementLog.create({
        ticketId,
        companyId,
        fromTagId: recentAIMove?.toTagId || null,
        toTagId: tagId,
        movedBy: 'user',
        userId: req.user.id,
        wasOverriddenByUser: !!recentAIMove,
        reason: recentAIMove ? 'Usuario sobrescribió clasificación IA' : 'Asignación manual de etapa'
      });
    } catch (logErr) {
      // No fallar por error de log
    }

    // 3. Elimina el job de seguimiento anterior (si existe)
    const removed = await removeFollowupJobByTicketId(ticketId);
    //console.log(`[TicketTag.store] Job de seguimiento anterior eliminado: ${removed}`);

    // 4. Busca ticket y programa nuevo seguimiento usando el nuevo sistema v2.0
    const ticket = await ShowTicketService(ticketId, companyId);

    // Usar el nuevo sistema de followup v2.0 si es un tag kanban
    if (tag.kanban === 1) {
      await handleTagAssignment(ticketId, tagId, companyId);
    } else {
      // Sistema legacy para tags no-kanban
      const apiKey = await obtenerApiKeyPorTicketId(ticket.id);
      if (tag.timeLane && tag.greetingMessageLane && apiKey) {
        // Convertir tag a la nueva estructura
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
    }

    // 5. Notifica por socket
    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });
    //console.log(`[TicketTag.store] Notificación socket enviada a company-${companyId}-ticket`);

    return res.status(201).json(ticketTag);

  } catch (error) {
    console.error(`[TicketTag.store] Error:`, error);
    return res.status(500).json({ error: 'Error al almacenar la etiqueta del ticket.' });
  }
};


/*
export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  //console.log("remove");
  //console.log(req.params);

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

  ////console.log("remove");
  ////console.log(req.params);

  try {
    // Retrieve tagIds associated with the provided ticketId from TicketTags
    const ticketTags = await TicketTag.findAll({ where: { ticketId } });
    const tagIds = ticketTags.map((ticketTag) => ticketTag.tagId);

    // Find the tagIds with kanban = 1 in the Tags table
    const tagsWithKanbanOne = await Tag.findAll({
      where: {
        id: tagIds,
        kanban: 1,
      },
    });

    // Remove the tagIds with kanban = 1 from TicketTags
    const tagIdsWithKanbanOne = tagsWithKanbanOne.map((tag) => tag.id);
    if (tagIdsWithKanbanOne)
      await TicketTag.destroy({ where: { ticketId, tagId: tagIdsWithKanbanOne } });


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