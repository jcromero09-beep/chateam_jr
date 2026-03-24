import TicketTag from "../../models/TicketTag";
import Tag from "../../models/Tag";
import logger from "../../utils/logger";

const SERVICE_PREFIX = '[TicketContextService]';

export interface TicketTagContext {
  kanbanStage: {
    key: string;
    name: string;
    description: string;
  } | null;
  normalTags: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * Servicio para extraer el contexto de tags de un ticket
 *
 * Proporciona información contextual de las etiquetas del ticket
 * para enriquecer las respuestas de la IA:
 * - Etapa kanban actual (tag con kanban > 0)
 * - Tags normales (notas del agente)
 */
class TicketContextService {

  /**
   * Extrae el contexto de tags de un ticket
   */
  static async getTicketContext(ticketId: number): Promise<TicketTagContext> {
    try {
      // 1. Buscar todas las tags del ticket
      const ticketTags = await TicketTag.findAll({
        where: { ticketId },
        include: [{
          model: Tag,
          as: 'tag',
          attributes: ['id', 'name', 'key', 'kanban', 'description']
        }]
      });

      if (!ticketTags || ticketTags.length === 0) {
        return {
          kanbanStage: null,
          normalTags: []
        };
      }

      // 2. Separar tags kanban (kanban > 0) de normales (kanban = 0)
      const kanbanTags = ticketTags.filter(tt => (tt.tag as any)?.kanban > 0);
      const normalTicketTags = ticketTags.filter(tt => (tt.tag as any)?.kanban === 0 || (tt.tag as any)?.kanban === null);

      // 3. Construir contexto kanban
      let kanbanStage: TicketTagContext['kanbanStage'] = null;
      if (kanbanTags.length > 0) {
        // Tomar la primera tag kanban (la más reciente)
        const kanbanTag = kanbanTags[0].tag as any;
        kanbanStage = {
          key: kanbanTag?.key || '',
          name: kanbanTag?.name || '',
          description: kanbanTag?.description || ''
        };
      }

      // 4. Construir contexto de tags normales
      const normalTags: TicketTagContext['normalTags'] = normalTicketTags
        .map(tt => {
          const tag = tt.tag as any;
          return {
            name: tag?.name || '',
            description: tag?.description || ''
          };
        })
        .filter(t => t.name || t.description);

      logger.info(
        `${SERVICE_PREFIX} Contexto extraído para ticket ${ticketId}: ` +
        `kanban=${kanbanStage?.key || 'none'}, normalTags=${normalTags.length}`
      );

      return {
        kanbanStage,
        normalTags
      };

    } catch (error: any) {
      logger.error(`${SERVICE_PREFIX} Error extrayendo contexto: ${error.message}`);
      return {
        kanbanStage: null,
        normalTags: []
      };
    }
  }

  /**
   * Construye un string de contexto para el prompt de la IA
   */
  static buildContextPrompt(context: TicketTagContext): string {
    const parts: string[] = [];

    // 1. Agregar etapa kanban
    if (context.kanbanStage) {
      const { key, name, description } = context.kanbanStage;
      parts.push(`**ETAPA DEL FUNNEL:** ${name} (${key})`);
      if (description) {
        parts.push(`   Descripción: ${description}`);
      }
    }

    // 2. Agregar tags normales
    if (context.normalTags.length > 0) {
      parts.push(`**NOTAS DEL TICKET:**`);
      context.normalTags.forEach(tag => {
        parts.push(`- ${tag.name}: ${tag.description || '(sin descripción)'}`);
      });
    }

    if (parts.length === 0) {
      return '';
    }

    return `\n--- CONTEXTO DEL TICKET ---\n${parts.join('\n')}\n`;
  }
}

export default TicketContextService;
