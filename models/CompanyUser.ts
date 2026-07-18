import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default
} from "sequelize-typescript";
import User from "./User";
import Company from "./Company";
import Role from "./Role";

/**
 * Membresía usuario↔empresa. Permite que UNA identidad global (User, email
 * único) pertenezca a N empresas con un rol (profile) potencialmente distinto
 * en cada una. La empresa "activa" vive en el token (companyId); cambiar de
 * empresa re-emite el token con el companyId de otra membresía (sesión
 * re-scopeada, misma sid). Ver switch-company / impersonación.
 */
@Table({ tableName: "CompanyUsers" })
class CompanyUser extends Model<CompanyUser> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: false })
  userId!: number;

  @BelongsTo(() => User)
  user!: User;

  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: false })
  companyId!: number;

  @BelongsTo(() => Company)
  company!: Company;

  @Default("user")
  @Column({ type: DataType.STRING(255), allowNull: false })
  profile!: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.INTEGER, allowNull: true })
  roleId!: number | null;

  @BelongsTo(() => Role)
  role!: Role;

  @Default(true)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  active!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default CompanyUser;
