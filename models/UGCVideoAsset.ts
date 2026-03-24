/**
 * Model: UGCVideoAsset
 * Stores individual asset files produced during the UGC video pipeline:
 * raw avatars, raw videos, composed finals, thumbnails, and subtitle files.
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
import UGCVideoJob from "./UGCVideoJob";
import UGCCampaign from "./UGCCampaign";

// Tipos de asset generados en el pipeline
export type UGCVideoAssetType =
  | "raw_avatar"
  | "raw_video"
  | "composed_final"
  | "thumbnail"
  | "subtitle_file";

@Table({
  tableName: "UGCVideoAssets",
  timestamps: true
})
class UGCVideoAsset extends Model<UGCVideoAsset> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_video_assets_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCVideoJob)
  @AllowNull(false)
  @Index("idx_ugc_video_assets_job")
  @Column(DataType.INTEGER)
  ugcVideoJobId!: number;

  @ForeignKey(() => UGCCampaign)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  ugcCampaignId!: number;

  @AllowNull(false)
  @Index("idx_ugc_video_assets_type")
  @Column(DataType.STRING(50))
  assetType!: UGCVideoAssetType;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  fileName!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  originalUrl?: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  localPath!: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.BIGINT)
  fileSize!: number;

  @Default("video/mp4")
  @AllowNull(false)
  @Column(DataType.STRING(255))
  mimeType!: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  duration?: number;

  @Default(1)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  version!: number;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  downloadCount!: number;

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

  @BelongsTo(() => UGCVideoJob)
  ugcVideoJob!: UGCVideoJob;

  @BelongsTo(() => UGCCampaign)
  ugcCampaign!: UGCCampaign;

  // --- Metodos auxiliares ---

  isFinalVideo(): boolean {
    return this.assetType === "composed_final";
  }

  isThumbnail(): boolean {
    return this.assetType === "thumbnail";
  }

  async deactivate(): Promise<void> {
    this.isActive = false;
    await this.save();
  }

  async incrementDownloads(): Promise<void> {
    this.downloadCount += 1;
    await this.save();
  }

  async incrementVersion(): Promise<void> {
    this.version += 1;
    await this.save();
  }
}

export default UGCVideoAsset;
