import { Model, ModelCtor, FindOptions, Includeable } from 'sequelize';
import logger from '../utils/logger';
// @ts-ignore - dataloader not installed
import DataLoader from 'dataloader';

/**
 * Query Optimizer Utility
 * Previene N+1 queries usando eager loading y DataLoader
 */

// DataLoader instances cache
const loaderCache = new Map<string, DataLoader<any, any>>();

/**
 * Create or get DataLoader for a model
 */
export function createDataLoader<T extends Model>(
  model: ModelCtor<T>,
  batchKey: string = 'id'
): DataLoader<any, T> {
  const cacheKey = `${model.name}:${batchKey}`;

  if (loaderCache.has(cacheKey)) {
    return loaderCache.get(cacheKey)!;
  }

  const loader = new DataLoader<any, T>(
    async (ids: readonly any[]) => {
      const records = await model.findAll({
        where: {
          [batchKey]: ids as any[]
        } as any
      });

      // Create a map for O(1) lookup
      const recordMap = new Map<any, T>();
      records.forEach(record => {
        recordMap.set((record as any)[batchKey], record);
      });

      // Return in same order as input
      return ids.map(id => recordMap.get(id) || null);
    },
    {
      cache: true,
      batchScheduleFn: callback => setTimeout(callback, 10) // 10ms batching window
    }
  );

  loaderCache.set(cacheKey, loader);
  return loader;
}

/**
 * Clear DataLoader cache
 */
export function clearDataLoaderCache(modelName?: string): void {
  if (modelName) {
    for (const key of loaderCache.keys()) {
      if (key.startsWith(modelName)) {
        loaderCache.delete(key);
      }
    }
  } else {
    loaderCache.clear();
  }
}

/**
 * Optimized find options with eager loading
 */
export interface OptimizedFindOptions<T extends Model> extends FindOptions<T> {
  eagerLoad?: string[]; // Relations to eager load
  dataLoader?: boolean; // Use DataLoader
}

/**
 * Get standard includes for common queries
 */
export const standardIncludes = {
  ticket: [
    { association: 'contact', attributes: ['id', 'name', 'number', 'profilePicUrl'] },
    { association: 'queue', attributes: ['id', 'name', 'color'] },
    { association: 'user', attributes: ['id', 'name', 'email'] },
    { association: 'whatsapp', attributes: ['id', 'name'] }
  ],

  message: [
    { association: 'ticket', attributes: ['id', 'status'] },
    { association: 'contact', attributes: ['id', 'name', 'profilePicUrl'] },
    { association: 'quotedMsg', attributes: ['id', 'body'] }
  ],

  contact: [
    { association: 'tickets', attributes: ['id', 'status', 'updatedAt'], limit: 5 },
    { association: 'company', attributes: ['id', 'name'] }
  ],

  campaign: [
    { association: 'whatsapp', attributes: ['id', 'name'] },
    { association: 'contactList', attributes: ['id', 'name'] },
    { association: 'user', attributes: ['id', 'name'] }
  ],

  user: [
    { association: 'company', attributes: ['id', 'name', 'plan'] },
    { association: 'queues', attributes: ['id', 'name'] }
  ]
};

/**
 * Auto-optimize query based on model
 */
export function optimizeQuery<T extends Model>(
  modelName: string,
  baseOptions: FindOptions<T> = {}
): FindOptions<T> {
  const optimized: FindOptions<T> = { ...baseOptions };

  // Add standard includes if not specified
  if (!optimized.include && standardIncludes[modelName.toLowerCase()]) {
    optimized.include = standardIncludes[modelName.toLowerCase()] as Includeable[];
  }

  // Add subQuery: false to prevent N+1 in associations
  if (optimized.include) {
    optimized.subQuery = false;
  }

  // Add logging in development
  if (process.env.NODE_ENV === 'development') {
    optimized.logging = (sql: any, timing: any) => {
      logger.debug(`Query [${modelName}]: ${sql} (${timing}ms)`);
    };
  }

  return optimized;
}

/**
 * Batch load relations
 */
export async function batchLoadRelation<T extends Model, R extends Model>(
  records: T[],
  relationName: string,
  foreignKey: string,
  relatedModel: ModelCtor<R>
): Promise<void> {
  if (records.length === 0) return;

  const ids = [...new Set(records.map(r => (r as any)[foreignKey]).filter(Boolean))];

  if (ids.length === 0) return;

  const related = await relatedModel.findAll({
    where: {
      id: ids as any[]
    } as any
  });

  const relatedMap = new Map<any, R>();
  related.forEach(r => relatedMap.set((r as any).id, r));

  records.forEach(record => {
    const foreignId = (record as any)[foreignKey];
    if (foreignId && relatedMap.has(foreignId)) {
      (record as any)[relationName] = relatedMap.get(foreignId);
    }
  });
}

/**
 * Query performance monitor
 */
export class QueryMonitor {
  private static queries: Array<{
    model: string;
    duration: number;
    sql: string;
    timestamp: Date;
  }> = [];

  static log(model: string, sql: string, duration: number): void {
    this.queries.push({
      model,
      sql,
      duration,
      timestamp: new Date()
    });

    // Log slow queries
    if (duration > 1000) {
      logger.warn(`Slow query detected in ${model}: ${sql.substring(0, 200)} (${duration}ms)`);
    }

    // Keep only last 1000 queries
    if (this.queries.length > 1000) {
      this.queries.shift();
    }
  }

  static getStats() {
    const stats = {
      total: this.queries.length,
      avgDuration: 0,
      slowQueries: this.queries.filter(q => q.duration > 1000).length,
      byModel: {} as Record<string, { count: number; avgDuration: number }>
    };

    if (this.queries.length > 0) {
      stats.avgDuration = this.queries.reduce((sum, q) => sum + q.duration, 0) / this.queries.length;

      this.queries.forEach(q => {
        if (!stats.byModel[q.model]) {
          stats.byModel[q.model] = { count: 0, avgDuration: 0 };
        }
        stats.byModel[q.model].count++;
        stats.byModel[q.model].avgDuration += q.duration;
      });

      Object.keys(stats.byModel).forEach(model => {
        stats.byModel[model].avgDuration /= stats.byModel[model].count;
      });
    }

    return stats;
  }

  static clear(): void {
    this.queries = [];
  }
}

/**
 * Sequelize hooks for query optimization
 */
export function setupQueryOptimization(sequelize: any): void {
  // Log all queries in development
  if (process.env.NODE_ENV === 'development') {
    sequelize.addHook('beforeFind', (options: any) => {
      options._startTime = Date.now();
    });

    sequelize.addHook('afterFind', (result: any, options: any) => {
      const duration = Date.now() - options._startTime;
      const modelName = options.model?.name || 'Unknown';
      QueryMonitor.log(modelName, options.sql || '', duration);
    });
  }

  // Auto-optimize finds
  sequelize.addHook('beforeFind', (options: any) => {
    const modelName = options.model?.name;
    if (modelName && !options._optimized) {
      const optimized = optimizeQuery(modelName, options);
      Object.assign(options, optimized);
      options._optimized = true;
    }
  });

  logger.info('Query optimization hooks installed');
}

/**
 * Pagination helper with cursor-based pagination for large datasets
 */
export interface CursorPaginationOptions {
  limit?: number;
  cursor?: string; // Base64 encoded cursor
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

export interface CursorPaginationResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
}

export async function cursorPaginate<T extends Model>(
  model: ModelCtor<T>,
  options: CursorPaginationOptions,
  where: any = {}
): Promise<CursorPaginationResult<T>> {
  const {
    limit = 20,
    cursor,
    orderBy = 'id',
    orderDirection = 'DESC'
  } = options;

  let decodedCursor: any = null;
  if (cursor) {
    try {
      decodedCursor = JSON.parse(Buffer.from(cursor, 'base64').toString());
    } catch (error) {
      logger.error('Invalid cursor: ' + String(error));
    }
  }

  const whereClause = { ...where };
  if (decodedCursor) {
    whereClause[orderBy] = {
      [orderDirection === 'DESC' ? '$lt' : '$gt']: decodedCursor[orderBy]
    };
  }

  const data = await model.findAll({
    where: whereClause,
    limit: limit + 1, // Fetch one extra to check if there's more
    order: [[orderBy, orderDirection]],
    subQuery: false
  });

  const hasMore = data.length > limit;
  if (hasMore) {
    data.pop(); // Remove extra item
  }

  const nextCursor = hasMore && data.length > 0
    ? Buffer.from(JSON.stringify({ [orderBy]: (data[data.length - 1] as any)[orderBy] })).toString('base64')
    : null;

  const prevCursor = data.length > 0
    ? Buffer.from(JSON.stringify({ [orderBy]: (data[0] as any)[orderBy] })).toString('base64')
    : null;

  return {
    data: data as T[],
    hasMore,
    nextCursor,
    prevCursor
  };
}
