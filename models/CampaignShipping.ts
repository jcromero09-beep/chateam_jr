import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
,
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
