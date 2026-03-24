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
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";

@Table({
  tableName: "AIDocuments",
  timestamps: true
})
class AIDocument extends Model<AIDocument> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column(DataType.INTEGER)
  companyId!: number;

  @Column({
    type: DataType.STRING(500),
    allowNull: false
  })
  title!: string; // Titulo del documento

  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  sourceType!: string; // Tipo de fuente: pdf, txt, url, csv, docx, manual

  @Column(DataType.TEXT)
  sourceUrl!: string; // URL de origen si aplica

  @Column(DataType.TEXT)
  filePath!: string; // Ruta del archivo en disco

  @Default(0)
  @Column(DataType.BIGINT)
  fileSizeBytes!: number; // Tamano del archivo en bytes

  @Default(0)
  @Column(DataType.INTEGER)
  chunksCount!: number; // Cantidad de chunks generados

  @Default(0)
  @Column(DataType.INTEGER)
  tokensCount!: number; // Total de tokens del documento

  @Default('pending')
  @Index
  @Column(DataType.STRING(30))
  status!: string; // pending, processing, completed, error, archived

  @Column(DataType.TEXT)
  errorMessage!: string; // Mensaje de error si fallo el procesamiento

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>; // Datos adicionales: language, author, pages, etc.

  @Column(DataType.DATE)
  processedAt!: Date; // Fecha de finalizacion del procesamiento

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @HasMany(() => require("./AIChunk").default)
  chunks!: any[];
}

export default AIDocument;
