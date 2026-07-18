import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default
} from 'sequelize-typescript';
import Company from '../Company';
import User from '../User';

@Table({
  tableName: 'email_templates',
  timestamps: true
})
class EmailTemplate extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false
  })
  subject: string;

  @Column(DataType.STRING(255))
  previewText: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  htmlContent: string;

  @Column(DataType.TEXT)
  textContent: string;

  @Default({})
  @Column(DataType.JSONB)
  designJson: object;

  @Default('general')
  @Column(DataType.STRING(100))
  category: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isAiGenerated: boolean;

  @Column(DataType.TEXT)
  aiPrompt: string;

  @Column(DataType.ARRAY(DataType.TEXT))
  tags: string[];

  @Column(DataType.TEXT)
  thumbnailUrl: string;

  @Default('draft')
  @Column(DataType.STRING(50))
  status: string;

  /**
   * Tipo de plantilla:
   *   - 'campaign': para envios masivos (campanas de email marketing)
   *   - 'tx': para envios transaccionales (passthrough)
   */
  @Default('campaign')
  @Column(DataType.STRING(50))
  type: string;

  /** Provider donde se sincronizo: 'acelle' | 'listmonk' */
  @Column(DataType.STRING(50))
  provider: string;

  /** ID externo de la plantilla en el provider */
  @Column(DataType.STRING(255))
  providerTemplateId: string;

  @ForeignKey(() => User)
  @Column(DataType.BIGINT)
  createdBy: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User)
  creator: User;
}

export default EmailTemplate;
