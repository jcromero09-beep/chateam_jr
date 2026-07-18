import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";

export type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected" | "revision_requested";

// [Fase2·Ola F · F2.1] Paquete mensual de piezas con aprobación + plazo 48h.
@Table({ tableName: "campaign_approvals", timestamps: true })
class CampaignApproval extends Model<CampaignApproval> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) id!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) companyId!: number;
  @Column({ type: DataType.STRING(7), allowNull: false }) period!: string;
  @Column({ type: DataType.STRING(160) }) title!: string;
  @Column({ type: DataType.STRING(24), allowNull: false, defaultValue: "draft" }) status!: ApprovalStatus;
  @Column({ type: DataType.TEXT }) feedback!: string;
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 }) revisionCount!: number;
  @Column({ type: DataType.DATE }) submittedAt!: Date;
  @Column({ type: DataType.DATE }) approvedAt!: Date;
  @Column({ type: DataType.INTEGER }) approvedByUserId!: number;
  @Column({ type: DataType.DATE }) deadlineAt!: Date;
  @Column({ type: DataType.JSONB }) pieces!: any;
  @CreatedAt createdAt!: Date;
  @UpdatedAt updatedAt!: Date;

  // --- Primitivo portado de UGCCreatorAssignment ---
  isApproved(): boolean { return this.status === "approved"; }

  async submit(): Promise<void> {
    this.status = "submitted";
    this.submittedAt = new Date();
    // Plazo 48h desde el envío (F2.1).
    this.deadlineAt = new Date(Date.now() + 48 * 3600 * 1000);
    await this.save();
  }
  async approve(userId?: number): Promise<void> {
    this.status = "approved";
    this.approvedAt = new Date();
    if (userId) this.approvedByUserId = userId;
    await this.save();
  }
  async reject(feedback: string): Promise<void> {
    this.status = "rejected";
    this.feedback = feedback;
    await this.save();
  }
  async requestRevision(feedback: string): Promise<void> {
    this.status = "revision_requested";
    this.feedback = feedback;
    this.revisionCount += 1;
    // Nuevo plazo 48h al pedir cambios.
    this.deadlineAt = new Date(Date.now() + 48 * 3600 * 1000);
    await this.save();
  }
}

export default CampaignApproval;
