import { Op } from "sequelize";
import sequelize from "../../database";
import AIEntity from "../../models/AIEntity";
import { AIEntityType } from "../../models/AIEntity";

/**
 * Busca entidades IA por capacidad específica.
 * Útil para el Model Router que necesita seleccionar el modelo óptimo
 * según la tarea (texto, imagen, embedding, etc.)
 *
 * Estrategia de routing:
 * - Modelos baratos: Clasificación y tareas simples (bajo costo)
 * - Modelos medio: La mayoría de consultas generales
 * - Modelos premium: Tareas complejas que requieren razonamiento avanzado
 */

interface Request {
  type: AIEntityType;
  capability?: string; // ej: "function_calling", "vision", "streaming"
  maxInputPrice?: number; // Filtro de precio máximo por 1K tokens
  minMaxTokens?: number; // Filtro de tokens mínimos
}

const FindByCapabilityService = async ({
  type,
  capability,
  maxInputPrice,
  minMaxTokens
}: Request): Promise<AIEntity[]> => {
  const whereCondition: any = {
    type,
    status: "active"
  };

  if (minMaxTokens) {
    whereCondition.maxTokens = {
      [Op.gte]: minMaxTokens
    };
  }

  if (maxInputPrice !== undefined) {
    whereCondition.inputPrice = {
      [Op.lte]: maxInputPrice
    };
  }

  let entities: AIEntity[];

  if (capability) {
    // Buscar en JSONB capabilities array usando operador de PostgreSQL
    entities = await AIEntity.findAll({
      where: {
        ...whereCondition,
        [Op.and]: [
          sequelize.literal(`"capabilities" @> '"${capability}"'`)
        ]
      },
      order: [
        ["inputPrice", "ASC"],  // Más barato primero
        ["maxTokens", "DESC"]   // Mayor capacidad primero
      ]
    });
  } else {
    entities = await AIEntity.findAll({
      where: whereCondition,
      order: [
        ["inputPrice", "ASC"],
        ["maxTokens", "DESC"]
      ]
    });
  }

  return entities;
};

export default FindByCapabilityService;
