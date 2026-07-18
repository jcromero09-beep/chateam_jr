/**
 * Model: AgentMemory
 * Stores memory fragments for agent identities: past posts, opinions,
 * personal facts, interactions, and preferences. Used to maintain
 * personality consistency across generated content.
 */

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
  Index,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import AgentIdentity from "./AgentIdentity";

// Tipos de memoria almacenables
export type AgentMemoryType =
  | "past_post"
  | "opinion"
  | "personal_fact"
  | "interaction"
  | "preference";

// Fuente de extraccion de la memoria
export type AgentMemoryExtractor = "seed" | "haiku_auto";

@Table({
  tableName: "AgentMemories",
  timestamps: true
})
class AgentMemory extends Model<AgentMemory> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => AgentIdentity)
  @AllowNull(false)
  @Index("idx_agent_memories_identity")
  @Column(DataType.INTEGER)
  agentIdentityId!: number;

  @AllowNull(false)
  @Index("idx_agent_memories_type")
  @Column(DataType.STRING(50))
  memoryType!: AgentMemoryType;

  @AllowNull(false)
  @Column(DataType.TEXT)
  content!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  context?: string;

  @Default("seed")
  @AllowNull(false)
  @Column(DataType.STRING(50))
  extractedBy!: AgentMemoryExtractor;

  @Default(1.0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(3, 2))
  confidence!: number;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  validUntil?: Date;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // --- Relaciones ---

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => AgentIdentity)
  agentIdentity!: AgentIdentity;

  // --- Metodos auxiliares ---

  isExpired(): boolean {
    if (!this.validUntil) return false;
    return new Date() > new Date(this.validUntil);
  }

  isHighConfidence(): boolean {
    return Number(this.confidence) >= 0.8;
  }
}

export default AgentMemory;
