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
  DataType
} from "sequelize-typescript";

import User from "./User";
import Company from "./Company";

@Table({ tableName: "UserTermsAcceptances" })
class UserTermsAcceptance extends Model<UserTermsAcceptance> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.INTEGER)
  documentType: string; // 'terms_conditions', 'privacy_policy'

  @Column(DataType.STRING)
  documentVersion: string;

  @Column(DataType.STRING)
  ipAddress: string;

  @Column(DataType.TEXT)
  userAgent: string;

  @Column(DataType.JSON)
  deviceInfo: object;

  @Column(DataType.DATE)
  acceptedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => User)
  user: User;

  @BelongsTo(() => Company)
  company: Company;
}

export default UserTermsAcceptance;
