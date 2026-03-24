/**
 * Model: UGCCreatorAssignment
 * Represents the assignment of a creator to a campaign with brief,
 * deadline, deliverables, and revision tracking.
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
import UGCCreator from "./UGCCreator";
import UGCCampaign from "./UGCCampaign";

// Estados del ciclo de vida de una asignacion
export type AssignmentStatus =
  | "invited"
  | "accepted"
  | "in_progress"
  | "submitted"
  | "revision_requested"
  | "approved"
  | "rejected"
  | "cancelled";

@Table({
  tableName: "UGCCreatorAssignments",
  timestamps: true
})
class UGCCreatorAssignment extends Model<UGCCreatorAssignment> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_creator_assignments_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCCreator)
  @AllowNull(false)
  @Index("idx_ugc_creator_assignments_creator")
  @Column(DataType.INTEGER)
  creatorId!: number;

  @ForeignKey(() => UGCCampaign)
  @AllowNull(false)
  @Index("idx_ugc_creator_assignments_campaign")
  @Column(DataType.INTEGER)
  campaignId!: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  brief!: string;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  requirements!: Record<string, unknown>;

  @AllowNull(false)
  @Column(DataType.DATE)
  deadline!: Date;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  agreedRate!: number;

  @Default("USD")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  currency!: string;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  deliverables!: Record<string, unknown>[];

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  revisionCount!: number;

  @Default(2)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  maxRevisions!: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  feedback?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  creatorNotes?: string;

  @Default("invited")
  @AllowNull(false)
  @Index("idx_ugc_creator_assignments_status")
  @Column(DataType.STRING(50))
  status!: AssignmentStatus;

  @AllowNull(true)
  @Column(DataType.DATE)
  invitedAt?: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  acceptedAt?: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  submittedAt?: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  approvedAt?: Date;

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

  @BelongsTo(() => UGCCreator)
  creator!: UGCCreator;

  @BelongsTo(() => UGCCampaign)
  campaign!: UGCCampaign;

  // HasMany UGCCreatorPayment se registra via lazy import

  // --- Metodos auxiliares ---

  isInvited(): boolean {
    return this.status === "invited";
  }

  isAccepted(): boolean {
    return this.status === "accepted";
  }

  isInProgress(): boolean {
    return this.status === "in_progress";
  }

  isSubmitted(): boolean {
    return this.status === "submitted";
  }

  isApproved(): boolean {
    return this.status === "approved";
  }

  canRequestRevision(): boolean {
    return this.revisionCount < this.maxRevisions && this.status === "submitted";
  }

  async accept(): Promise<void> {
    this.status = "accepted";
    this.acceptedAt = new Date();
    await this.save();
  }

  async startWork(): Promise<void> {
    this.status = "in_progress";
    await this.save();
  }

  async submit(): Promise<void> {
    this.status = "submitted";
    this.submittedAt = new Date();
    await this.save();
  }

  async requestRevision(feedback: string): Promise<void> {
    if (!this.canRequestRevision()) {
      throw new Error("No se pueden solicitar mas revisiones");
    }
    this.status = "revision_requested";
    this.feedback = feedback;
    this.revisionCount += 1;
    await this.save();
  }

  async approve(): Promise<void> {
    this.status = "approved";
    this.approvedAt = new Date();
    await this.save();
  }

  async reject(feedback: string): Promise<void> {
    this.status = "rejected";
    this.feedback = feedback;
    await this.save();
  }

  async cancel(): Promise<void> {
    this.status = "cancelled";
    await this.save();
  }
}

export default UGCCreatorAssignment;
