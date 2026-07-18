import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, CreatedAt } from "sequelize-typescript";
// [Fase2·Ola H · H.5] Auditoría inmutable de la moderación (quién hizo qué y cuándo).
@Table({ tableName: "comment_moderation_audits", timestamps: false })
class CommentModerationAudit extends Model<CommentModerationAudit> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) id!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) companyId!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) commentId!: number;
  @Column({ type: DataType.INTEGER }) userId!: number;
  @Column({ type: DataType.STRING(24), allowNull: false }) action!: string;
  @Column({ type: DataType.STRING(24) }) fromStatus!: string;
  @Column({ type: DataType.STRING(24) }) toStatus!: string;
  @Column({ type: DataType.STRING(60) }) category!: string;
  @Column({ type: DataType.TEXT }) draftBefore!: string;
  @Column({ type: DataType.TEXT }) draftAfter!: string;
  @Column({ type: DataType.TEXT }) note!: string;
  @CreatedAt createdAt!: Date;
}
export default CommentModerationAudit;
