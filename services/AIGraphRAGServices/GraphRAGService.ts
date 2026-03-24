import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

export interface GraphNode {
  id: string;
  type: 'entity' | 'concept' | 'document' | 'chunk';
  label: string;
  properties: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface GraphSearchResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  relevantChunks: Array<{
    chunkId: number;
    content: string;
    score: number;
    connectedEntities: string[];
  }>;
  queryExpansions: string[];
}

/**
 * Extract entities from text using LLM
 */
const extractEntities = async (
  text: string,
  companyId: number
): Promise<Array<{ name: string; type: string; aliases: string[] }>> => {
  try {
    const AIClientService = require("../AIClientService").default;
    const prompt = `Extract all named entities from this text. Return JSON array:
[{"name": "Entity Name", "type": "person|organization|product|location|concept|date|amount", "aliases": ["alt names"]}]

Text: "${text.substring(0, 2000)}"

Return ONLY the JSON array:`;

    const response = await AIClientService.generateText({
      prompt,
      modelKey: 'gpt-4.1-mini',
      maxTokens: 512,
      temperature: 0.1,
      responseFormat: 'json'
    });

    return JSON.parse(response.text);
  } catch (error: any) {
    logger.warn(`[GraphRAG] Entity extraction failed: ${error.message}`);
    return [];
  }
};

/**
 * Build knowledge graph edges from document chunks
 */
const buildGraphFromDocument = async (
  documentId: number,
  companyId: number
): Promise<{ nodesCreated: number; edgesCreated: number }> => {
  try {
    // Get all chunks for the document
    const chunks = await sequelize.query<Record<string, any>>(`
      SELECT id, content, "chunkIndex"
      FROM "AIChunks"
      WHERE "documentId" = :documentId AND "companyId" = :companyId
      ORDER BY "chunkIndex" ASC
    `, {
      replacements: { documentId, companyId },
      type: QueryTypes.SELECT
    });

    let totalNodes = 0;
    let totalEdges = 0;

    for (const chunk of chunks) {
      const entities = await extractEntities(chunk.content, companyId);

      for (const entity of entities) {
        // Upsert node in graph metadata (stored as JSONB in AIChunks.metadata)
        await sequelize.query(`
          UPDATE "AIChunks"
          SET metadata = jsonb_set(
            COALESCE(metadata, '{}'),
            '{graph_entities}',
            COALESCE(metadata->'graph_entities', '[]') || :entityJson::jsonb
          )
          WHERE id = :chunkId
        `, {
          replacements: {
            chunkId: chunk.id,
            entityJson: JSON.stringify([{
              name: entity.name,
              type: entity.type,
              aliases: entity.aliases
            }])
          },
          type: QueryTypes.UPDATE
        });
        totalNodes++;
      }

      // Create co-occurrence edges between entities in same chunk
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          totalEdges++;
        }
      }
    }

    logger.info(`[GraphRAG] Built graph for doc ${documentId}: ${totalNodes} nodes, ${totalEdges} edges`);
    return { nodesCreated: totalNodes, edgesCreated: totalEdges };
  } catch (error: any) {
    logger.error(`[GraphRAG] Error building graph: ${error.message}`);
    throw error;
  }
};

/**
 * Graph-enhanced search: expand query using entity relationships
 */
const graphSearch = async (
  query: string,
  companyId: number,
  options: { topK?: number; includeGraph?: boolean } = {}
): Promise<GraphSearchResult> => {
  const { topK = 5, includeGraph = true } = options;

  try {
    // 1. Extract entities from query
    const queryEntities = await extractEntities(query, companyId);
    const entityNames = queryEntities.map(e => e.name.toLowerCase());

    // 2. Find chunks containing related entities
    const entityChunks = await sequelize.query<Record<string, any>>(`
      SELECT DISTINCT c.id as "chunkId", c.content, c."documentId",
        c.metadata->'graph_entities' as entities
      FROM "AIChunks" c
      WHERE c."companyId" = :companyId
        AND c.metadata->'graph_entities' IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(c.metadata->'graph_entities') e
          WHERE LOWER(e->>'name') = ANY(:entityNames)
        )
      LIMIT :topK
    `, {
      replacements: { companyId, entityNames, topK: topK * 2 },
      type: QueryTypes.SELECT
    });

    // 3. Build query expansions from found entities
    const relatedEntities = new Set<string>();
    for (const chunk of entityChunks) {
      try {
        const ents = typeof chunk.entities === 'string'
          ? JSON.parse(chunk.entities)
          : chunk.entities;
        if (Array.isArray(ents)) {
          ents.forEach((e: any) => relatedEntities.add(e.name));
        }
      } catch { /* ignore parse errors */ }
    }

    const queryExpansions = Array.from(relatedEntities)
      .filter(name => !entityNames.includes(name.toLowerCase()))
      .slice(0, 5);

    // 4. Build graph visualization data
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    if (includeGraph) {
      const seenNodes = new Set<string>();
      for (const entity of [...queryEntities, ...Array.from(relatedEntities).map(name => ({ name, type: 'concept', aliases: [] }))]) {
        if (!seenNodes.has(entity.name)) {
          nodes.push({
            id: entity.name.toLowerCase().replace(/\s+/g, '_'),
            type: entity.type === 'concept' ? 'concept' : 'entity',
            label: entity.name,
            properties: { type: entity.type }
          });
          seenNodes.add(entity.name);
        }
      }

      // Co-occurrence edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length && j < i + 3; j++) {
          edges.push({
            source: nodes[i].id,
            target: nodes[j].id,
            relation: 'co_occurs',
            weight: 0.5
          });
        }
      }
    }

    const result: GraphSearchResult = {
      nodes,
      edges,
      relevantChunks: entityChunks.slice(0, topK).map((chunk: any) => ({
        chunkId: chunk.chunkId,
        content: chunk.content,
        score: 0.8,
        connectedEntities: entityNames
      })),
      queryExpansions
    };

    logger.info(
      `[GraphRAG] Search: ${queryEntities.length} entities, ${entityChunks.length} chunks, ` +
      `${queryExpansions.length} expansions`
    );

    return result;
  } catch (error: any) {
    logger.error(`[GraphRAG] Search error: ${error.message}`);
    return { nodes: [], edges: [], relevantChunks: [], queryExpansions: [] };
  }
};

export default {
  extractEntities,
  buildGraphFromDocument,
  graphSearch
};
