/**
 * Model: AgentIdentity
 * Represents a virtual agent persona with personality, style, and backstory
 * for UGC content generation and social media automation.
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
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  Index,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import AgentMemory from "./AgentMemory";
import AgentProfilePhoto from "./AgentProfilePhoto";

// Posibles estados de una identidad de agente
export type AgentIdentityStatus = "draft" | "generating" | "active" | "suspended" | "archived";

@Table({
  tableName: "AgentIdentities",
  timestamps: true
})
class AgentIdentity extends Model<AgentIdentity> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_agent_identities_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  usernameSuggestion?: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  age?: number;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  city?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  occupation?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  bioInstagram?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  bioTiktok?: string;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  personalityTraits!: string[];

  @AllowNull(true)
  @Column(DataType.TEXT)
  communicationStyle?: string;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  writingExamples!: string[];

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  interests!: string[];

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  catchphrases!: string[];

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  favoriteBrands!: string[];

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  contentPillars!: string[];

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  activeHours!: Record<string, unknown>;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  responseStyle!: Record<string, unknown>;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  physicalDescription!: Record<string, unknown>;

  @AllowNull(true)
  @Column(DataType.TEXT)
  backstory?: string;

  @AllowNull(true)
  @Index("idx_agent_identities_niche")
  @Column(DataType.STRING(255))
  niche?: string;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  platformFocus!: string[];

  @Default("draft")
  @AllowNull(false)
  @Index("idx_agent_identities_status")
  @Column(DataType.STRING(50))
  status!: AgentIdentityStatus;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Index("idx_agent_identities_created_by")
  @Column(DataType.INTEGER)
  createdBy?: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // --- Relaciones ---

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, "createdBy")
  creator?: User;

  @HasMany(() => AgentMemory)
  memories!: AgentMemory[];

  @HasMany(() => AgentProfilePhoto)
  profilePhotos!: AgentProfilePhoto[];

  // --- Metodos auxiliares ---

  isActive(): boolean {
    return this.status === "active";
  }

  isDraft(): boolean {
    return this.status === "draft";
  }

  isArchived(): boolean {
    return this.status === "archived";
  }

  async activate(): Promise<void> {
    this.status = "active";
    await this.save();
  }

  async suspend(): Promise<void> {
    this.status = "suspended";
    await this.save();
  }

  async archive(): Promise<void> {
    this.status = "archived";
    await this.save();
  }
}

export default AgentIdentity;
