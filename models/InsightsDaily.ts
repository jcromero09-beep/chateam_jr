// [Plan Fase 2 · Ola B · D5.1] Snapshot diario de insights de la Marketing API,
// base para el ROAS/CPA reales (E4.1). Un job horario hace upsert por
// (companyId, date, level, objectId).
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  CreatedAt,
  UpdatedAt,
  Index
} from "sequelize-typescript";

@Table({ tableName: "InsightsDaily" })
class InsightsDaily extends Model<InsightsDaily> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Index
  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.DATEONLY)
  date: string;

  @Column(DataType.STRING)
  level: "campaign" | "adset" | "ad";

  @Column(DataType.STRING)
  objectId: string;

  @Index
  @Column(DataType.STRING)
  campaignId: string;

  @Column(DataType.STRING)
  adSetId: string;

  @Column(DataType.STRING)
  adId: string;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.DECIMAL(14, 2))
  spend: number;

  @Column(DataType.BIGINT)
  impressions: number;

  @Column(DataType.BIGINT)
  clicks: number;

  @Column(DataType.DECIMAL(12, 4))
  cpm: number;

  @Column(DataType.DECIMAL(12, 4))
  cpc: number;

  @Column(DataType.DECIMAL(8, 4))
  ctr: number;

  @Column(DataType.DECIMAL(8, 4))
  frequency: number;

  @Column(DataType.INTEGER)
  conversationsStarted: number;

  @Column(DataType.DECIMAL(12, 4))
  costPerConversation: number;

  @Column(DataType.JSONB)
  raw: object;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default InsightsDaily;
