import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  CreatedAt,
  Default,
  Index
} from "sequelize-typescript";

@Table({
  tableName: "AISemanticCache",
  timestamps: true,
  updatedAt: false // Solo createdAt, no necesita updatedAt
})
class AISemanticCache extends Model<AISemanticCache> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Index
  @Column(DataType.INTEGER)
  companyId!: number; // Sin FK a Company por performance en queries de alta frecuencia

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  queryText!: string; // Texto original de la consulta

  // NOTA: El campo "queryEmbedding" (vector) se maneja via SQL raw
  // ya que pgvector no es soportado nativamente por sequelize-typescript.
  // Se agrega en la migracion como: queryEmbedding vector(1536)

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  response!: string; // Respuesta cacheada

  @Column(DataType.STRING(100))
  modelUsed!: string; // Modelo que genero la respuesta, ej: "gpt-4o"

  @Column(DataType.STRING(50))
  agentUsed!: string; // Agente que proceso la consulta, ej: "support", "sales"

  @Default(0)
  @Column(DataType.INTEGER)
  tokensInput!: number; // Tokens consumidos en el input

  @Default(0)
  @Column(DataType.INTEGER)
  tokensOutput!: number; // Tokens consumidos en el output

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  costUsd!: number; // Costo en USD de la generacion original

  @Default(1)
  @Column(DataType.INTEGER)
  hitCount!: number; // Cantidad de veces que se reutilizo esta cache

  @Column(DataType.DATE)
  lastHitAt!: Date; // Ultima vez que se uso esta cache

  @CreatedAt
  createdAt!: Date;

  @Index
  @Column(DataType.DATE)
  expiresAt!: Date; // Fecha de expiracion de la cache
}

export default AISemanticCache;
