import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../database';

interface LeadSourceAttributes {
  id: number;
  company_id: number;
  lead_id: number;
  source_type: 'facebook' | 'google' | 'linkedin' | 'organic' | 'direct' | 'referral' | 'email' | 'marketplace' | 'manual';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  fbclid?: string;
  gclid?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
  keyword?: string;
  placement?: string;
  device?: string;
  operating_system?: string;
  browser?: string;
  referrer_url?: string;
  landing_page_url?: string;
  ip_address?: string;
  user_agent?: string;
  attribution_method: 'first_touch' | 'last_touch' | 'multi_touch' | 'linear' | 'time_decay' | 'manual';
  attribution_confidence: number;
  conversion_value?: number;
  conversion_timestamp?: Date;
  session_id?: string;
  customer_journey_stage: 'awareness' | 'consideration' | 'conversion' | 'retention';
  touchpoint_sequence: number;
  time_to_conversion?: number;
  is_primary_source: boolean;
  attribution_weight: number;
  marketplace_source?: string;
  marketplace_lead_id?: string;
  manual_notes?: string;
  verified_by?: number;
  verification_timestamp?: Date;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

interface LeadSourceCreationAttributes extends Optional<LeadSourceAttributes,
  'id' | 'attribution_confidence' | 'touchpoint_sequence' | 'attribution_weight' | 'is_primary_source' | 'created_at' | 'updated_at'
> {}

class LeadSource extends Model<LeadSourceAttributes, LeadSourceCreationAttributes> implements LeadSourceAttributes {
  public id!: number;
  public company_id!: number;
  public lead_id!: number;
  public source_type!: 'facebook' | 'google' | 'linkedin' | 'organic' | 'direct' | 'referral' | 'email' | 'marketplace' | 'manual';
  public utm_source?: string;
  public utm_medium?: string;
  public utm_campaign?: string;
  public utm_term?: string;
  public utm_content?: string;
  public fbclid?: string;
  public gclid?: string;
  public campaign_id?: string;
  public adset_id?: string;
  public ad_id?: string;
  public keyword?: string;
  public placement?: string;
  public device?: string;
  public operating_system?: string;
  public browser?: string;
  public referrer_url?: string;
  public landing_page_url?: string;
  public ip_address?: string;
  public user_agent?: string;
  public attribution_method!: 'first_touch' | 'last_touch' | 'multi_touch' | 'linear' | 'time_decay' | 'manual';
  public attribution_confidence!: number;
  public conversion_value?: number;
  public conversion_timestamp?: Date;
  public session_id?: string;
  public customer_journey_stage!: 'awareness' | 'consideration' | 'conversion' | 'retention';
  public touchpoint_sequence!: number;
  public time_to_conversion?: number;
  public is_primary_source!: boolean;
  public attribution_weight!: number;
  public marketplace_source?: string;
  public marketplace_lead_id?: string;
  public manual_notes?: string;
  public verified_by?: number;
  public verification_timestamp?: Date;
  public metadata?: any;
  public created_at!: Date;
  public updated_at!: Date;

  public isFromPaidAds(): boolean {
    return ['facebook', 'google', 'linkedin'].includes(this.source_type);
  }

  public isOrganicTraffic(): boolean {
    return ['organic', 'direct', 'referral'].includes(this.source_type);
  }

  public hasUtmParameters(): boolean {
    return !!(this.utm_source || this.utm_medium || this.utm_campaign);
  }

  public hasClickIds(): boolean {
    return !!(this.fbclid || this.gclid);
  }

  public getAttributionScore(): number {
    let score = this.attribution_confidence;

    if (this.hasClickIds()) score += 0.3;
    if (this.hasUtmParameters()) score += 0.2;
    if (this.campaign_id) score += 0.2;
    if (this.is_primary_source) score += 0.1;

    return Math.min(score, 1.0);
  }

  public getSourceDescription(): string {
    const descriptions = {
      'facebook': 'Facebook/Instagram Ads',
      'google': 'Google Ads',
      'linkedin': 'LinkedIn Ads',
      'organic': 'Búsqueda Orgánica',
      'direct': 'Tráfico Directo',
      'referral': 'Sitio de Referencia',
      'email': 'Email Marketing',
      'marketplace': 'Marketplace/Lead Form',
      'manual': 'Asignación Manual'
    };
    return descriptions[this.source_type] || 'Desconocido';
  }

  public getCampaignName(): string {
    if (this.utm_campaign) return this.utm_campaign;
    if (this.campaign_id) return `Campaign ${this.campaign_id}`;
    if (this.marketplace_source) return this.marketplace_source;
    return 'Sin campaña';
  }

  public getTimeToConversionFormatted(): string {
    if (!this.time_to_conversion) return 'N/A';

    const hours = Math.floor(this.time_to_conversion / 3600);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} días`;
    if (hours > 0) return `${hours} horas`;
    return `${this.time_to_conversion} segundos`;
  }

  public static async findByLead(leadId: number, companyId: number): Promise<LeadSource[]> {
    return this.findAll({
      where: { lead_id: leadId, company_id: companyId },
      order: [['touchpoint_sequence', 'ASC']]
    });
  }

  public static async findPrimarySource(leadId: number, companyId: number): Promise<LeadSource | null> {
    return this.findOne({
      where: {
        lead_id: leadId,
        company_id: companyId,
        is_primary_source: true
      }
    });
  }

  public static async getAttributionSummary(companyId: number, dateRange?: { start: Date; end: Date }): Promise<any> {
    const whereClause: any = { company_id: companyId };

    if (dateRange) {
      whereClause.created_at = {
        [Op.between]: [dateRange.start, dateRange.end]
      };
    }

    const summary = await this.findAll({
      attributes: [
        'source_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_leads'],
        [sequelize.fn('SUM', sequelize.col('conversion_value')), 'total_value'],
        [sequelize.fn('AVG', sequelize.col('attribution_confidence')), 'avg_confidence'],
        [sequelize.fn('AVG', sequelize.col('time_to_conversion')), 'avg_time_to_conversion']
      ],
      where: whereClause,
      group: ['source_type'],
      raw: true
    });

    return summary.map((item: any) => ({
      source: item.source_type,
      totalLeads: parseInt(item.total_leads) || 0,
      totalValue: parseFloat(item.total_value) || 0,
      avgConfidence: parseFloat(item.avg_confidence) || 0,
      avgTimeToConversion: parseFloat(item.avg_time_to_conversion) || 0
    }));
  }

  public static async getCampaignAttribution(companyId: number, campaignId: string): Promise<any> {
    const results = await this.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_attributed'],
        [sequelize.fn('SUM', sequelize.col('conversion_value')), 'total_value'],
        [sequelize.fn('AVG', sequelize.col('attribution_confidence')), 'avg_confidence']
      ],
      where: {
        company_id: companyId,
        campaign_id: campaignId
      },
      raw: true
    });

    return results[0] || {
      total_attributed: 0,
      total_value: 0,
      avg_confidence: 0
    };
  }
}

LeadSource.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  lead_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'leads',
      key: 'id'
    }
  },
  source_type: {
    type: DataTypes.ENUM('facebook', 'google', 'linkedin', 'organic', 'direct', 'referral', 'email', 'marketplace', 'manual'),
    allowNull: false,
  },
  utm_source: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  utm_medium: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  utm_campaign: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  utm_term: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  utm_content: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  fbclid: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  gclid: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  campaign_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  adset_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  ad_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  keyword: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  placement: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  device: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  operating_system: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  browser: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  referrer_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  landing_page_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  attribution_method: {
    type: DataTypes.ENUM('first_touch', 'last_touch', 'multi_touch', 'linear', 'time_decay', 'manual'),
    allowNull: false,
    defaultValue: 'last_touch',
  },
  attribution_confidence: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: false,
    defaultValue: 0.5,
    validate: {
      min: 0,
      max: 1
    }
  },
  conversion_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  },
  conversion_timestamp: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  session_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  customer_journey_stage: {
    type: DataTypes.ENUM('awareness', 'consideration', 'conversion', 'retention'),
    allowNull: false,
    defaultValue: 'awareness',
  },
  touchpoint_sequence: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
  time_to_conversion: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_primary_source: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  attribution_weight: {
    type: DataTypes.DECIMAL(3, 2),
    allowNull: false,
    defaultValue: 1.0,
  },
  marketplace_source: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  marketplace_lead_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  manual_notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  verified_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  verification_timestamp: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  sequelize,
  tableName: 'lead_sources',
  timestamps: true,
  underscored: true,
  indexes: [
    { fields: ['company_id'] },
    { fields: ['lead_id'] },
    { fields: ['source_type'] },
    { fields: ['campaign_id'] },
    { fields: ['adset_id'] },
    { fields: ['ad_id'] },
    { fields: ['utm_campaign'] },
    { fields: ['fbclid'] },
    { fields: ['gclid'] },
    { fields: ['attribution_method'] },
    { fields: ['is_primary_source'] },
    { fields: ['customer_journey_stage'] },
    { fields: ['touchpoint_sequence'] },
    { fields: ['marketplace_lead_id'] },
    { fields: ['created_at'] },
    { fields: ['company_id', 'lead_id'] },
    { fields: ['company_id', 'source_type'] },
    { fields: ['company_id', 'campaign_id'] },
  ]
});

export default LeadSource;
