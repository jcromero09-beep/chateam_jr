import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  AutoIncrement,
  DataType,
  Default
} from "sequelize-typescript";

import Company from "./Company";
import User from "./User";

@Table
class QuickMessage extends Model<QuickMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  shortcode: string;

  @Column(DataType.STRING)
  message: string;

  @Column(DataType.STRING)
  get mediaPath(): string | null {
    if (this.getDataValue("mediaPath")) {
      
      return `${process.env.BACKEND_URL}${process.env.PROXY_PORT ?`:${process.env.PROXY_PORT}`:""}/public/company${this.companyId}/quickMessage/${this.getDataValue("mediaPath")}`;

    }
    return null;
  }
  
  @Column(DataType.STRING)
  mediaName: string;

  @Column(DataType.BOOLEAN)
  geral: boolean;
  
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User)
  user: User;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column(DataType.BOOLEAN)
  visao: boolean;

  // ── IA Semantic Integration ────────────────────────────────────────
  /** Descripción semántica del propósito del QuickReply */
  @Column(DataType.STRING(100))
  intent: string;

  /** Embedding vectorial del campo intent (para búsqueda semántica pgvector) */
  @Column(DataType.ARRAY(DataType.FLOAT))
  intentEmbedding: number[];

  /** Si true, este QuickReply se considera en el pipeline IA */
  @Default(false)
  @Column(DataType.BOOLEAN)
  isAiEnabled: boolean;
}

export default QuickMessage;
