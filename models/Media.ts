import { DataTypes, Model, Optional, Op } from 'sequelize';
import sequelize from '../database';

// Interfaz para los atributos del modelo Media
interface MediaAttributes {
  id: string;
  company_id: number;
  original_name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_provider: 'local' | 's3' | 'minio';
  storage_key: string;
  storage_bucket?: string;
  storage_region?: string;
  url?: string;
  thumbnail_url?: string;
  status: 'active' | 'expired' | 'deleted' | 'processing';
  expires_at: Date;
  notified_at?: Date;
  references_count: number;
  is_legal_hold: boolean;
  metadata?: any;
  tags?: string[];
  uploaded_by: number;
  created_at: Date;
  updated_at: Date;
}

// Atributos opcionales al crear
interface MediaCreationAttributes extends Optional<MediaAttributes,
  'id' | 'status' | 'references_count' | 'is_legal_hold' | 'created_at' | 'updated_at'
> {}

/**
 * Modelo Media para gestión de archivos con ciclo de vida
 */
class Media extends Model<MediaAttributes, MediaCreationAttributes> implements MediaAttributes {
  public id!: string;
  public company_id!: number;
  public original_name!: string;
  public filename!: string;
  public mime_type!: string;
  public size_bytes!: number;
  public storage_provider!: 'local' | 's3' | 'minio';
  public storage_key!: string;
  public storage_bucket?: string;
  public storage_region?: string;
  public url?: string;
  public thumbnail_url?: string;
  public status!: 'active' | 'expired' | 'deleted' | 'processing';
  public expires_at!: Date;
  public notified_at?: Date;
  public references_count!: number;
  public is_legal_hold!: boolean;
  public metadata?: any;
  public tags?: string[];
  public uploaded_by!: number;
  public created_at!: Date;
  public updated_at!: Date;

  // ==========================================
  // MÉTODOS DE INSTANCIA
  // ==========================================

  /**
   * Verifica si el archivo está expirado
   */
  public isExpired(): boolean {
    return new Date() > this.expires_at && !this.is_legal_hold;
  }

  /**
   * Verifica si necesita notificación de expiración
   */
  public needsExpirationNotification(daysBefore: number = 5): boolean {
    if (this.notified_at || this.is_legal_hold) {
      return false;
    }

    const notificationDate = new Date(this.expires_at);
    notificationDate.setDate(notificationDate.getDate() - daysBefore);

    return new Date() >= notificationDate;
  }

  /**
   * Marca como notificado
   */
  public async markAsNotified(): Promise<void> {
    this.notified_at = new Date();
    await this.save();
  }

  /**
   * Incrementa contador de referencias
   */
  public async incrementReferences(): Promise<void> {
    this.references_count += 1;
    await this.save();
  }

  /**
   * Decrementa contador de referencias
   */
  public async decrementReferences(): Promise<void> {
    this.references_count = Math.max(0, this.references_count - 1);
    await this.save();
  }

  /**
   * Marca como legal hold
   */
  public async setLegalHold(hold: boolean): Promise<void> {
    this.is_legal_hold = hold;
    await this.save();
  }

  /**
   * Extiende la fecha de expiración
   */
  public async extendExpiration(days: number): Promise<void> {
    const newExpirationDate = new Date(this.expires_at);
    newExpirationDate.setDate(newExpirationDate.getDate() + days);
    this.expires_at = newExpirationDate;
    await this.save();
  }

  /**
   * Obtiene la URL completa del archivo
   */
  public getFullUrl(): string {
    if (this.url) {
      return this.url;
    }

    // Generar URL basada en el provider
    switch (this.storage_provider) {
      case 's3':
      case 'minio':
        const endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
        const bucket = this.storage_bucket || process.env.S3_BUCKET || 'chateam-files';
        return `${endpoint}/${bucket}/${this.storage_key}`;
      case 'local':
        return `/public/uploads/${this.storage_key}`;
      default:
        return '';
    }
  }

  /**
   * Calcula el tamaño en formato legible
   */
  public getFormattedSize(): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (this.size_bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(this.size_bytes) / Math.log(1024));
    return Math.round(this.size_bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // ==========================================
  // MÉTODOS ESTÁTICOS
  // ==========================================

  /**
   * Obtiene archivos que necesitan notificación de expiración
   */
  static async getFilesNeedingNotification(daysBefore: number = 5): Promise<Media[]> {
    const notificationDate = new Date();
    notificationDate.setDate(notificationDate.getDate() + daysBefore);

    return await Media.findAll({
      where: {
        status: 'active',
        is_legal_hold: false,
        notified_at: null,
        expires_at: {
          [Op.lte]: notificationDate
        }
      }
    });
  }

  /**
   * Obtiene archivos expirados listos para eliminar
   */
  static async getExpiredFiles(): Promise<Media[]> {
    return await Media.findAll({
      where: {
        status: 'active',
        is_legal_hold: false,
        expires_at: {
          [Op.lt]: new Date()
        }
      }
    });
  }

  /**
   * Obtiene archivos por empresa
   */
  static async getByCompany(companyId: number, options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ files: Media[], total: number }> {
    const whereClause: any = { company_id: companyId };

    if (options.status) {
      whereClause.status = options.status;
    }

    const { count, rows } = await Media.findAndCountAll({
      where: whereClause,
      limit: options.limit || 50,
      offset: options.offset || 0,
      order: [['created_at', 'DESC']]
    });

    return {
      files: rows,
      total: count
    };
  }

  /**
   * Calcula estadísticas de uso por empresa
   */
  static async getCompanyStats(companyId: number): Promise<{
    total_files: number;
    total_size_bytes: number;
    active_files: number;
    expired_files: number;
    legal_hold_files: number;
  }> {
    const stats = await Media.findOne({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_files'],
        [sequelize.fn('SUM', sequelize.col('size_bytes')), 'total_size_bytes'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status = 'active' THEN 1 END")), 'active_files'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN status = 'expired' THEN 1 END")), 'expired_files'],
        [sequelize.fn('COUNT', sequelize.literal("CASE WHEN is_legal_hold = true THEN 1 END")), 'legal_hold_files'],
      ],
      where: { company_id: companyId },
      raw: true
    }) as any;

    return {
      total_files: parseInt(stats.total_files) || 0,
      total_size_bytes: parseInt(stats.total_size_bytes) || 0,
      active_files: parseInt(stats.active_files) || 0,
      expired_files: parseInt(stats.expired_files) || 0,
      legal_hold_files: parseInt(stats.legal_hold_files) || 0,
    };
  }
}

// ==========================================
// DEFINICIÓN DEL MODELO
// ==========================================
Media.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'companies',
      key: 'id'
    }
  },
  original_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  size_bytes: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
  },
  storage_provider: {
    type: DataTypes.ENUM('local', 's3', 'minio'),
    allowNull: false,
    defaultValue: 's3',
  },
  storage_key: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  storage_bucket: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  storage_region: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  thumbnail_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('active', 'expired', 'deleted', 'processing'),
    allowNull: false,
    defaultValue: 'active',
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  notified_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  references_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  is_legal_hold: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
  },
  uploaded_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
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
  tableName: 'media',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['company_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['expires_at']
    },
    {
      fields: ['storage_provider']
    },
    {
      fields: ['is_legal_hold']
    },
    {
      fields: ['uploaded_by']
    },
    {
      fields: ['company_id', 'status']
    },
    {
      fields: ['expires_at', 'is_legal_hold']
    }
  ]
});

export default Media;
