/**
 * Model: AgentProfilePhoto
 * Stores AI-generated or uploaded photos for agent identities.
 * Supports profile pics, story casuals, activity shots, and banners.
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

// Tipos de foto de perfil disponibles
export type AgentPhotoType = "profile" | "story_casual" | "activity_shot" | "banner";

@Table({
  tableName: "AgentProfilePhotos",
  timestamps: true
})
class AgentProfilePhoto extends Model<AgentProfilePhoto> {
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
  @Index("idx_agent_profile_photos_identity")
  @Column(DataType.INTEGER)
  agentIdentityId!: number;

  @AllowNull(false)
  @Index("idx_agent_profile_photos_type")
  @Column(DataType.STRING(50))
  photoType!: AgentPhotoType;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  url!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  originalUrl?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  dallePrompt?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  dalleRevisedPrompt?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  localPath?: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  fileSize?: number;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default(1)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  version!: number;

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

  isProfilePhoto(): boolean {
    return this.photoType === "profile";
  }

  async deactivate(): Promise<void> {
    this.isActive = false;
    await this.save();
  }

  async incrementVersion(): Promise<void> {
    this.version += 1;
    await this.save();
  }
}

export default AgentProfilePhoto;
