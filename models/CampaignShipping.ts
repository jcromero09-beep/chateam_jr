import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
  DataType
} from "sequelize-typescript";
import Campaign from "./Campaign";
import ContactListItem from "./ContactListItem";

@Table({ tableName: "CampaignShipping" })
class CampaignShipping extends Model<CampaignShipping> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  jobId: string;

  @Column(DataType.STRING)
  number: string;

  @Column(DataType.STRING)
  message: string;

  @Column(DataType.STRING)
  confirmationMessage: string;

  @Column(DataType.BOOLEAN)
  confirmation: boolean;

  @ForeignKey(() => ContactListItem)
  @Column(DataType.INTEGER)
  contactId: number;

  @ForeignKey(() => Campaign)
  @Column(DataType.INTEGER)
  campaignId: number;

  @Column(DataType.DATE)
  confirmationRequestedAt?: Date;

  @Column(DataType.DATE)
  confirmedAt?: Date;

  @Column(DataType.DATE)
  deliveredAt?: Date;

  // ───── Métricas de intentos y fallos ─────
  @Default(0)
  @Column(DataType.INTEGER)
  attemptCount: number;

  @Column(DataType.DATE)
  failedAt?: Date;

  @Column(DataType.TEXT)
  errorMessage?: string;

  @Column(DataType.STRING(255))
  metaMessageId?: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => ContactListItem)
  contact: ContactListItem;

  @BelongsTo(() => Campaign)
  campaign: Campaign;
}

export default CampaignShipping;
