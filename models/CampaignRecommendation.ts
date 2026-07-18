import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

@Table({
  tableName: "CampaignRecommendations",
  timestamps: true
})
class CampaignRecommendation extends Model<CampaignRecommendation> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    comment: "ID de Facebook guardado como STRING para evitar perdida de precision"
  })
  campaignId!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  campaignName!: string;

  @Column({
    type: DataType.ENUM("optimization", "warning", "opportunity", "insight"),
    allowNull: false,
    defaultValue: "optimization"
  })
  type!: "optimization" | "warning" | "opportunity" | "insight";

  @Column({
    type: DataType.ENUM("critical", "high", "medium", "low"),
    allowNull: false,
    defaultValue: "medium"
  })
  priority!: "critical" | "high" | "medium" | "low";

  @Column({
    type: DataType.ENUM("timing", "content", "segmentation", "budget", "channel"),
    allowNull: false,
    defaultValue: "content"
  })
  category!: "timing" | "content" | "segmentation" | "budget" | "channel";

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  description!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true
  })
  impact!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: true
  })
  effort!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true
  })
  potentialGain!: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Datos estructurados para aplicar la recomendacion"
  })
  actionData!: any;

  @Default("active")
  @Column({
    type: DataType.ENUM("active", "applied", "dismissed"),
    allowNull: false
  })
  status!: "active" | "applied" | "dismissed";

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  appliedAt!: Date;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  appliedBy!: number;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, "appliedBy")
  appliedByUser!: User;
}

export default CampaignRecommendation;
