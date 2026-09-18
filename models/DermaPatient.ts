/**
 * Modelo: DermaPatient
 * Paciente del módulo Derma (análisis facial profesional para esteticistas,
 * cosmetólogas y cosmiatras). Es un registro propio del módulo, aislado por
 * companyId; opcionalmente se enlaza a un Contact del CRM.
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
  AllowNull,
  Index,
  Default,
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import Contact from "./Contact";
import DermaAnalysis from "./DermaAnalysis";

@Table({
  tableName: "DermaPatients",
  timestamps: true,
})
class DermaPatient extends Model<DermaPatient> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_derma_patients_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  userId?: number; // profesional que dio de alta al paciente

  @ForeignKey(() => Contact)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  contactId?: number; // enlace opcional al CRM

  @AllowNull(false)
  @Column(DataType.STRING(150))
  name!: string;

  @AllowNull(true)
  @Column(DataType.STRING(150))
  email?: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  phone?: string;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  birthDate?: string;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  gender?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  notes?: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  lastScore?: number; // score global del último análisis completado

  @AllowNull(true)
  @Column(DataType.DATE)
  lastAnalysisAt?: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User)
  user?: User;

  @BelongsTo(() => Contact)
  contact?: Contact;

  @HasMany(() => DermaAnalysis)
  analyses!: DermaAnalysis[];

  /** Edad en años calculada desde birthDate (null si no hay fecha). */
  get age(): number | null {
    if (!this.birthDate) return null;
    const birth = new Date(this.birthDate);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const m = now.getUTCMonth() - birth.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
    return age;
  }
}

export default DermaPatient;
