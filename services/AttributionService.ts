import LeadSource from '../models/LeadSource';
import logger, { logError, logInfo, logWarn, logDebug } from '../utils/logger';
import { Op } from 'sequelize';

interface AttributionRules {
  defaultMethod: 'first_touch' | 'last_touch' | 'multi_touch' | 'linear' | 'time_decay';
  timeWindowHours: number;
  minimumConfidence: number;
  priorityOrder: string[];
  autoVerifyThreshold: number;
}

interface LeadData {
  id: number;
  email?: string;
  phone?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
  landing_page?: string;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  created_at: Date;
}

interface TouchpointData {
  timestamp: Date;
  source_type: string;
  utm_parameters?: any;
  click_ids?: any;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  device?: string;
  browser?: string;
  session_id?: string;
  page_url?: string;
}

interface MarketplaceMapping {
  source: string;
  campaignMapping: { [key: string]: string };
  leadIdField: string;
  defaultCampaign?: string;
}

export class AttributionService {
  private rules: AttributionRules;
  private marketplaceMappings: Map<string, MarketplaceMapping>;

  constructor() {
    this.rules = {
      defaultMethod: 'last_touch',
      timeWindowHours: 720, // 30 días
      minimumConfidence: 0.3,
      priorityOrder: ['facebook', 'google', 'linkedin', 'email', 'organic', 'direct', 'referral', 'marketplace'],
      autoVerifyThreshold: 0.8
    };

    this.initializeMarketplaceMappings();
  }

  private initializeMarketplaceMappings(): void {
    this.marketplaceMappings = new Map();

    // Ejemplo: Mapping para mercadolibre
    this.marketplaceMappings.set('mercadolibre', {
      source: 'MercadoLibre',
      campaignMapping: {
        'producto_premium': 'MercadoLibre Premium Listing',
        'producto_clasico': 'MercadoLibre Classic Listing',
        'mercadoshops': 'MercadoShops Store'
      },
      leadIdField: 'meli_lead_id',
      defaultCampaign: 'MercadoLibre - General'
    });

    // Ejemplo: Mapping para OLX
    this.marketplaceMappings.set('olx', {
      source: 'OLX',
      campaignMapping: {
        'destacado': 'OLX Destacado',
        'normal': 'OLX Publicación Normal',
        'super_destacado': 'OLX Super Destacado'
      },
      leadIdField: 'olx_lead_id',
      defaultCampaign: 'OLX - General'
    });
  }

  async attributeLead(leadData: LeadData, companyId: number): Promise<LeadSource[]> {
    logInfo('🎯 Iniciando atribución de lead', {
      leadId: leadData.id,
      companyId,
      email: leadData.email
    });

    try {
      // 1. Detectar fuentes basadas en parámetros directos
      const directSources = await this.detectDirectSources(leadData, companyId);

      // 2. Buscar touchpoints previos en ventana de tiempo
      const historicalTouchpoints = await this.findHistoricalTouchpoints(leadData, companyId);

      // 3. Aplicar reglas de atribución
      const attributedSources = await this.applyAttributionRules(
        [...directSources, ...historicalTouchpoints],
        leadData,
        companyId
      );

      // 4. Validar y ajustar confianza
      const validatedSources = await this.validateAttribution(attributedSources);

      // 5. Guardar resultados
      const savedSources = await this.saveAttributionResults(validatedSources);

      logInfo('✅ Atribución completada', {
        leadId: leadData.id,
        sourcesFound: savedSources.length,
        primarySource: savedSources.find(s => s.is_primary_source)?.source_type
      });

      return savedSources;

    } catch (error) {
      logError('❌ Error en atribución:', error);
      // Crear fuente fallback
      return this.createFallbackAttribution(leadData, companyId);
    }
  }

  private async detectDirectSources(leadData: LeadData, companyId: number): Promise<Partial<LeadSource>[]> {
    const sources: Partial<LeadSource>[] = [];

    // Facebook Click ID
    if (leadData.fbclid) {
      const fbSource = await this.createFacebookAttribution(leadData, companyId);
      if (fbSource) sources.push(fbSource);
    }

    // Google Click ID
    if (leadData.gclid) {
      const googleSource = await this.createGoogleAttribution(leadData, companyId);
      if (googleSource) sources.push(googleSource);
    }

    // UTM Parameters
    if (leadData.utm_source) {
      const utmSource = await this.createUTMAttribution(leadData, companyId);
      if (utmSource) sources.push(utmSource);
    }

    // Referrer-based attribution
    if (leadData.referrer && !sources.length) {
      const referrerSource = await this.createReferrerAttribution(leadData, companyId);
      if (referrerSource) sources.push(referrerSource);
    }

    return sources;
  }

  private async createFacebookAttribution(leadData: LeadData, companyId: number): Promise<Partial<LeadSource> | null> {
    try {
      // Intentar obtener datos de campaña usando Facebook API o base de datos
      const campaignData = await this.fetchFacebookCampaignData(leadData.fbclid!);

      return {
        company_id: companyId,
        lead_id: leadData.id,
        source_type: 'facebook',
        fbclid: leadData.fbclid,
        utm_source: leadData.utm_source,
        utm_medium: leadData.utm_medium,
        utm_campaign: leadData.utm_campaign,
        campaign_id: campaignData?.campaign_id,
        adset_id: campaignData?.adset_id,
        ad_id: campaignData?.ad_id,
        attribution_method: 'last_touch',
        attribution_confidence: 0.9,
        customer_journey_stage: 'conversion',
        touchpoint_sequence: 1,
        is_primary_source: true,
        attribution_weight: 1.0,
        landing_page_url: leadData.landing_page,
        session_id: leadData.session_id,
      };
    } catch (error) {
      logWarn('No se pudo obtener datos de campaña de Facebook:', error.message);
      return {
        company_id: companyId,
        lead_id: leadData.id,
        source_type: 'facebook',
        fbclid: leadData.fbclid,
        attribution_method: 'last_touch',
        attribution_confidence: 0.7,
        customer_journey_stage: 'conversion',
        is_primary_source: true,
      };
    }
  }

  private async createGoogleAttribution(leadData: LeadData, companyId: number): Promise<Partial<LeadSource> | null> {
    try {
      // Intentar obtener datos de campaña usando Google Ads API
      const campaignData = await this.fetchGoogleCampaignData(leadData.gclid!);

      return {
        company_id: companyId,
        lead_id: leadData.id,
        source_type: 'google',
        gclid: leadData.gclid,
        utm_source: leadData.utm_source,
        utm_medium: leadData.utm_medium,
        utm_campaign: leadData.utm_campaign,
        campaign_id: campaignData?.campaign_id,
        adset_id: campaignData?.adgroup_id,
        keyword: campaignData?.keyword,
        attribution_method: 'last_touch',
        attribution_confidence: 0.9,
        customer_journey_stage: 'conversion',
        is_primary_source: true,
        attribution_weight: 1.0,
      };
    } catch (error) {
      logWarn('No se pudo obtener datos de campaña de Google:', error.message);
      return {
        company_id: companyId,
        lead_id: leadData.id,
        source_type: 'google',
        gclid: leadData.gclid,
        attribution_method: 'last_touch',
        attribution_confidence: 0.7,
        customer_journey_stage: 'conversion',
        is_primary_source: true,
      };
    }
  }

  private async createUTMAttribution(leadData: LeadData, companyId: number): Promise<Partial<LeadSource> | null> {
    const sourceType = this.determineSourceTypeFromUTM(leadData.utm_source!, leadData.utm_medium);

    return {
      company_id: companyId,
      lead_id: leadData.id,
      source_type: sourceType,
      utm_source: leadData.utm_source,
      utm_medium: leadData.utm_medium,
      utm_campaign: leadData.utm_campaign,
      utm_term: leadData.utm_term,
      utm_content: leadData.utm_content,
      attribution_method: 'last_touch',
      attribution_confidence: 0.8,
      customer_journey_stage: 'conversion',
      is_primary_source: true,
      attribution_weight: 1.0,
    };
  }

  private async createReferrerAttribution(leadData: LeadData, companyId: number): Promise<Partial<LeadSource> | null> {
    const sourceType = this.determineSourceTypeFromReferrer(leadData.referrer!);

    return {
      company_id: companyId,
      lead_id: leadData.id,
      source_type: sourceType,
      referrer_url: leadData.referrer,
      attribution_method: 'last_touch',
      attribution_confidence: 0.6,
      customer_journey_stage: 'conversion',
      is_primary_source: true,
      attribution_weight: 1.0,
    };
  }

  private async findHistoricalTouchpoints(leadData: LeadData, companyId: number): Promise<Partial<LeadSource>[]> {
    const timeWindow = new Date(leadData.created_at.getTime() - (this.rules.timeWindowHours * 60 * 60 * 1000));

    // Buscar touchpoints previos por email, teléfono o session_id
    const whereConditions = [];

    if (leadData.email) {
      whereConditions.push({ email: leadData.email });
    }

    if (leadData.phone) {
      whereConditions.push({ phone: leadData.phone });
    }

    if (leadData.session_id) {
      whereConditions.push({ session_id: leadData.session_id });
    }

    if (whereConditions.length === 0) return [];

    try {
      // En una implementación real, esto buscaría en una tabla de touchpoints/sesiones
      // Por ahora, retornamos un array vacío y manejamos solo el touchpoint actual
      return [];
    } catch (error) {
      logWarn('Error buscando touchpoints históricos:', error.message);
      return [];
    }
  }

  private async applyAttributionRules(
    touchpoints: Partial<LeadSource>[],
    leadData: LeadData,
    companyId: number
  ): Promise<Partial<LeadSource>[]> {
    if (touchpoints.length === 0) {
      return this.createFallbackAttribution(leadData, companyId);
    }

    // Ordenar por prioridad y timestamp
    const sortedTouchpoints = touchpoints.sort((a, b) => {
      const aPriority = this.rules.priorityOrder.indexOf(a.source_type!);
      const bPriority = this.rules.priorityOrder.indexOf(b.source_type!);
      return aPriority - bPriority;
    });

    // Aplicar método de atribución
    switch (this.rules.defaultMethod) {
      case 'first_touch':
        return this.applyFirstTouchAttribution(sortedTouchpoints);
      case 'last_touch':
        return this.applyLastTouchAttribution(sortedTouchpoints);
      case 'multi_touch':
        return this.applyMultiTouchAttribution(sortedTouchpoints);
      case 'linear':
        return this.applyLinearAttribution(sortedTouchpoints);
      case 'time_decay':
        return this.applyTimeDecayAttribution(sortedTouchpoints);
      default:
        return this.applyLastTouchAttribution(sortedTouchpoints);
    }
  }

  private applyLastTouchAttribution(touchpoints: Partial<LeadSource>[]): Partial<LeadSource>[] {
    return touchpoints.map((tp, index) => ({
      ...tp,
      is_primary_source: index === 0,
      attribution_weight: index === 0 ? 1.0 : 0.0,
      touchpoint_sequence: index + 1
    }));
  }

  private applyFirstTouchAttribution(touchpoints: Partial<LeadSource>[]): Partial<LeadSource>[] {
    const lastIndex = touchpoints.length - 1;
    return touchpoints.map((tp, index) => ({
      ...tp,
      is_primary_source: index === lastIndex,
      attribution_weight: index === lastIndex ? 1.0 : 0.0,
      touchpoint_sequence: index + 1
    }));
  }

  private applyMultiTouchAttribution(touchpoints: Partial<LeadSource>[]): Partial<LeadSource>[] {
    const weight = 1.0 / touchpoints.length;
    return touchpoints.map((tp, index) => ({
      ...tp,
      is_primary_source: index === 0,
      attribution_weight: weight,
      touchpoint_sequence: index + 1
    }));
  }

  private applyLinearAttribution(touchpoints: Partial<LeadSource>[]): Partial<LeadSource>[] {
    return this.applyMultiTouchAttribution(touchpoints);
  }

  private applyTimeDecayAttribution(touchpoints: Partial<LeadSource>[]): Partial<LeadSource>[] {
    const totalTouchpoints = touchpoints.length;
    return touchpoints.map((tp, index) => {
      const decayFactor = Math.pow(0.7, totalTouchpoints - index - 1);
      return {
        ...tp,
        is_primary_source: index === 0,
        attribution_weight: decayFactor,
        touchpoint_sequence: index + 1
      };
    });
  }

  private async validateAttribution(sources: Partial<LeadSource>[]): Promise<Partial<LeadSource>[]> {
    return sources.map(source => {
      let confidence = source.attribution_confidence || 0.5;

      // Ajustar confianza basada en datos disponibles
      if (source.fbclid || source.gclid) confidence += 0.2;
      if (source.utm_campaign) confidence += 0.1;
      if (source.campaign_id) confidence += 0.1;

      // Normalizar entre 0 y 1
      confidence = Math.min(Math.max(confidence, 0), 1);

      return {
        ...source,
        attribution_confidence: confidence
      };
    });
  }

  private async saveAttributionResults(sources: Partial<LeadSource>[]): Promise<LeadSource[]> {
    const savedSources: LeadSource[] = [];

    for (const source of sources) {
      try {
        const saved = await LeadSource.create(source as any);
        savedSources.push(saved);
      } catch (error) {
        logError('Error guardando fuente de atribución:', error);
      }
    }

    return savedSources;
  }

  private async createFallbackAttribution(leadData: LeadData, companyId: number): Promise<LeadSource[]> {
    const fallbackSource = await LeadSource.create({
      company_id: companyId,
      lead_id: leadData.id,
      source_type: 'direct',
      attribution_method: 'manual',
      attribution_confidence: 0.3,
      customer_journey_stage: 'conversion',
      is_primary_source: true,
      attribution_weight: 1.0,
      touchpoint_sequence: 1,
      manual_notes: 'Atribución automática fallida - requiere revisión manual'
    });

    return [fallbackSource];
  }

  async attributeMarketplaceLead(
    leadData: LeadData,
    companyId: number,
    marketplaceSource: string,
    marketplaceLeadId: string,
    campaignType?: string
  ): Promise<LeadSource> {
    const mapping = this.marketplaceMappings.get(marketplaceSource.toLowerCase());
    let campaignName = mapping?.defaultCampaign || `${marketplaceSource} - General`;

    if (campaignType && mapping?.campaignMapping[campaignType]) {
      campaignName = mapping.campaignMapping[campaignType];
    }

    return LeadSource.create({
      company_id: companyId,
      lead_id: leadData.id,
      source_type: 'marketplace',
      marketplace_source: marketplaceSource,
      marketplace_lead_id: marketplaceLeadId,
      utm_campaign: campaignName,
      attribution_method: 'manual',
      attribution_confidence: 0.95,
      customer_journey_stage: 'conversion',
      is_primary_source: true,
      attribution_weight: 1.0,
      touchpoint_sequence: 1,
    });
  }

  async updateAttribution(
    leadId: number,
    companyId: number,
    updates: Partial<LeadSource>,
    userId: number
  ): Promise<LeadSource[]> {
    const sources = await LeadSource.findByLead(leadId, companyId);

    for (const source of sources) {
      await source.update({
        ...updates,
        verified_by: userId,
        verification_timestamp: new Date(),
        attribution_method: 'manual'
      });
    }

    logInfo('✅ Atribución actualizada manualmente', {
      leadId,
      companyId,
      userId,
      sourcesUpdated: sources.length
    });

    return sources;
  }

  async getAttributionSummary(companyId: number, dateRange?: { start: Date; end: Date }): Promise<any> {
    return LeadSource.getAttributionSummary(companyId, dateRange);
  }

  async getCampaignAttribution(companyId: number, campaignId: string): Promise<any> {
    return LeadSource.getCampaignAttribution(companyId, campaignId);
  }

  private determineSourceTypeFromUTM(utmSource: string, utmMedium?: string): any {
    const source = utmSource.toLowerCase();
    const medium = utmMedium?.toLowerCase();

    if (source.includes('facebook') || source.includes('fb')) return 'facebook';
    if (source.includes('google')) return 'google';
    if (source.includes('linkedin')) return 'linkedin';
    if (medium === 'email') return 'email';
    if (medium === 'organic') return 'organic';

    return 'referral';
  }

  private determineSourceTypeFromReferrer(referrer: string): any {
    const ref = referrer.toLowerCase();

    if (ref.includes('facebook.com') || ref.includes('fb.com')) return 'facebook';
    if (ref.includes('google.com')) return 'google';
    if (ref.includes('linkedin.com')) return 'linkedin';
    if (ref.includes('t.co') || ref.includes('twitter.com')) return 'referral';

    return 'referral';
  }

  private async fetchFacebookCampaignData(fbclid: string): Promise<any> {
    // En una implementación real, esto haría una llamada a Facebook API
    // Para obtener datos de campaña basados en el fbclid
    return null;
  }

  private async fetchGoogleCampaignData(gclid: string): Promise<any> {
    // En una implementación real, esto haría una llamada a Google Ads API
    // Para obtener datos de campaña basados en el gclid
    return null;
  }

  updateRules(newRules: Partial<AttributionRules>): void {
    this.rules = { ...this.rules, ...newRules };
    logInfo('🔧 Reglas de atribución actualizadas', { rules: this.rules } as any);
  }

  addMarketplaceMapping(marketplace: string, mapping: MarketplaceMapping): void {
    this.marketplaceMappings.set(marketplace.toLowerCase(), mapping);
    logInfo(`📍 Mapping de marketplace agregado: ${marketplace}`);
  }
}
