import Bull from 'bull';
import { Op } from 'sequelize';
import LeadSource from '../models/LeadSource';
import { AttributionService } from '../services/AttributionService';
import logger, { logError, logInfo, logWarn, logDebug } from '../utils/logger';

interface RetrofitJobData {
  companyId: number;
  batchSize?: number;
  startDate?: string;
  endDate?: string;
  forceUpdate?: boolean;
  leadIds?: number[];
}

interface RetrofitResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export class AttributionRetrofitJob {
  private queue: Bull.Queue;
  private attributionService: AttributionService;

  constructor(redisConfig: any) {
    this.queue = new Bull('attribution-retrofit', {
      redis: redisConfig,
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 100,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });

    this.attributionService = new AttributionService();
    this.setupProcessors();
  }

  private setupProcessors(): void {
    this.queue.process('retrofit-attribution', 5, async (job: Bull.Job<RetrofitJobData>) => {
      const { companyId, batchSize = 100, startDate, endDate, forceUpdate = false, leadIds } = job.data;

      logInfo('🔄 Iniciando job de retrofit de atribución', {
        companyId,
        batchSize,
        startDate,
        endDate,
        forceUpdate,
        leadIdsCount: leadIds?.length
      });

      try {
        const result = await this.processRetrofit(job.data, (progress) => {
          job.progress(progress);
        });

        logInfo('✅ Job de retrofit completado', {
          companyId,
          result
        });

        return result;

      } catch (error) {
        logError('❌ Error en job de retrofit:', error);
        throw error;
      }
    });

    // Job para análisis de gaps de atribución
    this.queue.process('analyze-attribution-gaps', 3, async (job: Bull.Job<{ companyId: number }>) => {
      const { companyId } = job.data;

      logInfo('🔍 Analizando gaps de atribución', { companyId });

      try {
        const gaps = await this.analyzeAttributionGaps(companyId);

        // Si hay gaps significativos, programar retrofit automático
        if (gaps.totalUnattributed > 10) {
          await this.scheduleRetrofit({
            companyId,
            batchSize: 50,
            forceUpdate: false
          });
        }

        return gaps;

      } catch (error) {
        logError('❌ Error analizando gaps:', error);
        throw error;
      }
    });

    // Job para optimización de confianza
    this.queue.process('optimize-attribution-confidence', 2, async (job: Bull.Job<{ companyId: number }>) => {
      const { companyId } = job.data;

      logInfo('🎯 Optimizando confianza de atribución', { companyId });

      try {
        const result = await this.optimizeAttributionConfidence(companyId);
        return result;

      } catch (error) {
        logError('❌ Error optimizando confianza:', error);
        throw error;
      }
    });
  }

  async scheduleRetrofit(data: RetrofitJobData): Promise<Bull.Job> {
    const job = await this.queue.add('retrofit-attribution', data, {
      priority: data.forceUpdate ? 1 : 5,
      delay: 0,
    });

    logInfo('📅 Job de retrofit programado', {
      jobId: job.id,
      companyId: data.companyId
    });

    return job;
  }

  async scheduleAttributionAnalysis(companyId: number): Promise<Bull.Job> {
    const job = await this.queue.add('analyze-attribution-gaps', { companyId }, {
      repeat: { cron: '0 2 * * *' }, // Todos los días a las 2 AM
    });

    logInfo('📊 Análisis de atribución programado', {
      jobId: job.id,
      companyId
    });

    return job;
  }

  async scheduleConfidenceOptimization(companyId: number): Promise<Bull.Job> {
    const job = await this.queue.add('optimize-attribution-confidence', { companyId }, {
      repeat: { cron: '0 3 * * 0' }, // Domingos a las 3 AM
    });

    logInfo('🎯 Optimización de confianza programada', {
      jobId: job.id,
      companyId
    });

    return job;
  }

  private async processRetrofit(
    data: RetrofitJobData,
    progressCallback: (progress: number) => void
  ): Promise<RetrofitResult> {
    const { companyId, batchSize = 100, startDate, endDate, forceUpdate, leadIds } = data;

    const result: RetrofitResult = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    try {
      // Obtener leads a procesar
      const leads = await this.getLeadsToProcess(companyId, startDate, endDate, leadIds, forceUpdate);

      logInfo(`📋 ${leads.length} leads encontrados para retrofit`);

      const totalBatches = Math.ceil(leads.length / batchSize);

      for (let i = 0; i < totalBatches; i++) {
        const batchStart = i * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, leads.length);
        const batch = leads.slice(batchStart, batchEnd);

        logInfo(`📦 Procesando batch ${i + 1}/${totalBatches} (${batch.length} leads)`);

        const batchResult = await this.processBatch(batch, companyId, forceUpdate);

        result.totalProcessed += batchResult.totalProcessed;
        result.successful += batchResult.successful;
        result.failed += batchResult.failed;
        result.skipped += batchResult.skipped;
        result.errors.push(...batchResult.errors);

        // Actualizar progreso
        const progress = Math.round(((i + 1) / totalBatches) * 100);
        progressCallback(progress);

        // Pausa entre batches para no sobrecargar
        if (i < totalBatches - 1) {
          await this.sleep(1000);
        }
      }

      return result;

    } catch (error) {
      result.errors.push(error.message);
      throw error;
    }
  }

  private async getLeadsToProcess(
    companyId: number,
    startDate?: string,
    endDate?: string,
    leadIds?: number[],
    forceUpdate?: boolean
  ): Promise<any[]> {
    // En una implementación real, esto obtendría leads de la tabla leads
    // Por ahora, simulamos con datos de ejemplo

    let whereClause: any = { company_id: companyId };

    if (leadIds && leadIds.length > 0) {
      whereClause.id = { [Op.in]: leadIds };
    } else {
      if (startDate) {
        whereClause.created_at = { [Op.gte]: new Date(startDate) };
      }
      if (endDate) {
        whereClause.created_at = {
          ...whereClause.created_at,
          [Op.lte]: new Date(endDate)
        };
      }
    }

    // Si no es forzado, excluir leads que ya tienen atribución confiable
    if (!forceUpdate) {
      const leadsWithGoodAttribution = await LeadSource.findAll({
        attributes: ['lead_id'],
        where: {
          company_id: companyId,
          attribution_confidence: { [Op.gte]: 0.8 }
        },
        raw: true
      });

      const excludeIds = leadsWithGoodAttribution.map(l => l.lead_id);
      if (excludeIds.length > 0) {
        whereClause.id = {
          ...whereClause.id,
          [Op.notIn]: excludeIds
        };
      }
    }

    // Simulación de consulta a tabla leads
    // En implementación real: return Lead.findAll({ where: whereClause });
    return this.generateMockLeads(companyId, 50);
  }

  private generateMockLeads(companyId: number, count: number): any[] {
    const leads = [];
    for (let i = 1; i <= count; i++) {
      leads.push({
        id: i,
        company_id: companyId,
        email: `lead${i}@example.com`,
        utm_source: i % 3 === 0 ? 'facebook' : i % 3 === 1 ? 'google' : null,
        utm_campaign: i % 3 === 0 ? 'campaign_fb_' + i : i % 3 === 1 ? 'campaign_google_' + i : null,
        fbclid: i % 5 === 0 ? `fbclid_${i}` : null,
        gclid: i % 7 === 0 ? `gclid_${i}` : null,
        created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      });
    }
    return leads;
  }

  private async processBatch(
    leads: any[],
    companyId: number,
    forceUpdate: boolean
  ): Promise<RetrofitResult> {
    const result: RetrofitResult = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    for (const lead of leads) {
      result.totalProcessed++;

      try {
        // Verificar si ya tiene atribución
        const existingAttribution = await LeadSource.findOne({
          where: {
            company_id: companyId,
            lead_id: lead.id
          }
        });

        if (existingAttribution && !forceUpdate) {
          result.skipped++;
          continue;
        }

        // Eliminar atribución existente si es update forzado
        if (existingAttribution && forceUpdate) {
          await LeadSource.destroy({
            where: {
              company_id: companyId,
              lead_id: lead.id
            }
          });
        }

        // Realizar nueva atribución
        const attributedSources = await this.attributionService.attributeLead(lead, companyId);

        if (attributedSources.length > 0) {
          result.successful++;
        } else {
          result.failed++;
          result.errors.push(`No se pudo atribuir lead ${lead.id}`);
        }

      } catch (error) {
        result.failed++;
        result.errors.push(`Error procesando lead ${lead.id}: ${error.message}`);
        logError(`Error en lead ${lead.id}:`, error);
      }
    }

    return result;
  }

  private async analyzeAttributionGaps(companyId: number): Promise<any> {
    try {
      // Contar leads sin atribución
      const totalLeads = await this.countTotalLeads(companyId);

      const leadsWithAttribution = await LeadSource.count({
        where: { company_id: companyId },
        distinct: true,
        col: 'lead_id'
      });

      const unattributedLeads = totalLeads - leadsWithAttribution;

      // Contar por confidence levels
      const lowConfidenceCount = await LeadSource.count({
        where: {
          company_id: companyId,
          attribution_confidence: { [Op.lt]: 0.5 }
        }
      });

      const mediumConfidenceCount = await LeadSource.count({
        where: {
          company_id: companyId,
          attribution_confidence: { [Op.between]: [0.5, 0.8] }
        }
      });

      const highConfidenceCount = await LeadSource.count({
        where: {
          company_id: companyId,
          attribution_confidence: { [Op.gte]: 0.8 }
        }
      });

      const gaps = {
        totalLeads,
        totalAttributed: leadsWithAttribution,
        totalUnattributed: unattributedLeads,
        attributionRate: totalLeads > 0 ? (leadsWithAttribution / totalLeads) * 100 : 0,
        confidenceLevels: {
          low: lowConfidenceCount,
          medium: mediumConfidenceCount,
          high: highConfidenceCount
        },
        recommendations: []
      };

      // Generar recomendaciones
      if (gaps.attributionRate < 70) {
        gaps.recommendations.push('Implementar mejor tracking de UTMs');
      }

      if (lowConfidenceCount > highConfidenceCount) {
        gaps.recommendations.push('Revisar y mejorar reglas de atribución');
      }

      if (unattributedLeads > 10) {
        gaps.recommendations.push('Ejecutar retrofit de atribución');
      }

      logInfo('📊 Análisis de gaps completado', gaps);
      return gaps;

    } catch (error) {
      logError('❌ Error analizando gaps:', error);
      throw error;
    }
  }

  private async optimizeAttributionConfidence(companyId: number): Promise<any> {
    try {
      // Obtener sources con baja confianza
      const lowConfidenceSources = await LeadSource.findAll({
        where: {
          company_id: companyId,
          attribution_confidence: { [Op.lt]: 0.7 }
        }
      });

      let optimized = 0;

      for (const source of lowConfidenceSources) {
        let newConfidence = source.attribution_confidence;

        // Incrementar confianza basado en datos adicionales
        if (source.campaign_id) newConfidence += 0.1;
        if (source.fbclid || source.gclid) newConfidence += 0.2;
        if (source.utm_campaign) newConfidence += 0.1;

        // Limitar a 1.0
        newConfidence = Math.min(newConfidence, 1.0);

        if (newConfidence > source.attribution_confidence) {
          await source.update({ attribution_confidence: newConfidence });
          optimized++;
        }
      }

      const result = {
        totalAnalyzed: lowConfidenceSources.length,
        optimized,
        avgConfidenceImprovement: optimized > 0 ? (optimized / lowConfidenceSources.length) * 100 : 0
      };

      logInfo('🎯 Optimización de confianza completada', result);
      return result;

    } catch (error) {
      logError('❌ Error optimizando confianza:', error);
      throw error;
    }
  }

  private async countTotalLeads(companyId: number): Promise<number> {
    // En implementación real: return Lead.count({ where: { company_id: companyId } });
    return 100; // Mock
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress(),
      state: await job.getState(),
      createdAt: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason
    };
  }

  async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaiting(),
      this.queue.getActive(),
      this.queue.getCompleted(),
      this.queue.getFailed()
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    };
  }

  async pauseQueue(): Promise<void> {
    await this.queue.pause();
    logInfo('⏸️ Cola de atribución pausada');
  }

  async resumeQueue(): Promise<void> {
    await this.queue.resume();
    logInfo('▶️ Cola de atribución reanudada');
  }

  async cleanQueue(): Promise<void> {
    await this.queue.clean(5000, 'completed');
    await this.queue.clean(5000, 'failed');
    logInfo('🧹 Cola de atribución limpiada');
  }
}
