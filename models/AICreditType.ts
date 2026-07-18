import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  Unique,
  Index
} from "sequelize-typescript";
import AICreditBalance from "./AICreditBalance";

@Table({
  tableName: "AICreditTypes",
  timestamps: true
})
class AICreditType extends Model<AICreditType> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Unique
  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  key!: string; // Identificador unico del tipo, ej: "chat_tokens", "embedding_tokens", "image_gen"

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  name!: string; // Nombre visible, ej: "Tokens de Chat", "Generacion de Imagenes"

  @Column({
    type: DataType.STRING(50),
    allowNull: true
  })
  category!: string; // [Fase A] categoria del tipo (AICreditTransactionController la selecciona)

  @Column(DataType.TEXT)
  description!: string; // Descripcion del tipo de credito

  @Column({
    type: DataType.STRING(30),
    allowNull: false
  })
  unit!: string; // Unidad de medida: "tokens", "requests", "minutes", "credits"

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  defaultCost!: number; // Costo por defecto por unidad (USD)

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean; // Si el tipo de credito esta activo

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @HasMany(() => AICreditBalance)
  balances!: any[];
}

export default AICreditType;
