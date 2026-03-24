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
  Index
} from "sequelize-typescript";
import Company from "./Company";
import AICreditType from "./AICreditType";

@Table({
  tableName: "AICreditBalances",
  timestamps: true
})
class AICreditBalance extends Model<AICreditBalance> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @ForeignKey(() => AICreditType)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  creditTypeId!: number;

  // NOTA: Unique constraint (companyId + creditTypeId) se maneja en la migracion:
  // queryInterface.addConstraint('AICreditBalances', {
  //   fields: ['companyId', 'creditTypeId'],
  //   type: 'unique',
  //   name: 'unique_company_credit_type'
  // });

  @Default(0)
  @Column(DataType.DECIMAL(15, 4))
  totalCredits!: number; // Total de creditos asignados

  @Default(0)
  @Column(DataType.DECIMAL(15, 4))
  usedCredits!: number; // Creditos consumidos

  @Column(DataType.DATE)
  resetAt!: Date; // Fecha de proximo reset (nullable, para planes con ciclo)

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Virtual getter: creditos restantes
  get remainingCredits(): number {
    return Number(this.totalCredits) - Number(this.usedCredits);
  }

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => AICreditType)
  creditType!: AICreditType;
}

export default AICreditBalance;
