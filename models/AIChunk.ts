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
  Default,
  Index
} from "sequelize-typescript";
import AIDocument from "./AIDocument";

@Table({
  tableName: "AIChunks",
  timestamps: true,
  updatedAt: false // Solo createdAt, sin updatedAt
})
class AIChunk extends Model<AIChunk> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => AIDocument)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    onDelete: "CASCADE"
  })
  documentId!: number; // FK al documento padre

  @Index
  @Column(DataType.INTEGER)
  companyId!: number; // Denormalizado para queries rapidas por empresa

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  content!: string; // Contenido textual del chunk

  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  chunkIndex!: number; // Indice del chunk dentro del documento

  @Default(0)
  @Column(DataType.INTEGER)
  tokenCount!: number; // Cantidad de tokens del chunk

  @Column(DataType.STRING(255))
  topic!: string; // Tema principal del chunk (generado por IA)

  @Default([])
  @Column(DataType.JSONB)
  keywords!: string[]; // Palabras clave extraidas del chunk

  // NOTA: El campo "embedding" (vector) se maneja via SQL raw
  // ya que pgvector no es soportado nativamente por sequelize-typescript.
  // Se agrega en la migracion como: embedding vector(1536)

  @ForeignKey(() => AIChunk)
  @Column(DataType.INTEGER)
  parentChunkId!: number; // Auto-referencia para chunks jerarquicos (nullable)

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>; // Datos adicionales: position, page, section, etc.

  @CreatedAt
  createdAt!: Date;

  // Relaciones
  @BelongsTo(() => AIDocument)
  document!: AIDocument;

  @BelongsTo(() => AIChunk, { foreignKey: "parentChunkId", as: "parentChunk" })
  parentChunk!: AIChunk;
}

export default AIChunk;
