import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Asegurar que la extensión pgvector esté habilitada
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Crear la tabla con columnas estándar primero (sin la columna vector)
    await queryInterface.createTable("AIChunks", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      documentId: {
        type: DataTypes.INTEGER,
        references: { model: "AIDocuments", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Documento al que pertenece este chunk"
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Empresa propietaria (denormalizado para performance)"
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Contenido textual del chunk"
      },
      chunkIndex: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Índice/posición del chunk dentro del documento"
      },
      tokenCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Cantidad de tokens en este chunk"
      },
      topic: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Tema o categoría del chunk"
      },
      parentChunkId: {
        type: DataTypes.INTEGER,
        references: { model: "AIChunks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true,
        comment: "Referencia al chunk padre (para chunks jerárquicos)"
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Metadatos adicionales del chunk"
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // Agregar columna vector(1536) usando SQL raw (Sequelize no soporta tipo vector)
    await queryInterface.sequelize.query(`
      ALTER TABLE "AIChunks" ADD COLUMN "embedding" vector(1536);
    `);

    // Agregar columna keywords TEXT[] usando SQL raw
    await queryInterface.sequelize.query(`
      ALTER TABLE "AIChunks" ADD COLUMN "keywords" TEXT[];
    `);

    // Índice por companyId para multi-tenancy
    await queryInterface.addIndex("AIChunks", ["companyId"], {
      name: "ai_chunks_company_id_idx"
    });

    // Índice por documentId para buscar chunks de un documento
    await queryInterface.addIndex("AIChunks", ["documentId"], {
      name: "ai_chunks_document_id_idx"
    });

    // Índice IVFFlat para búsqueda vectorial de embeddings (cosine similarity)
    await queryInterface.sequelize.query(`
      CREATE INDEX ai_chunks_embedding_ivfflat_idx
      ON "AIChunks"
      USING ivfflat ("embedding" vector_cosine_ops)
      WITH (lists = 100);
    `);

    // Índice GIN para búsqueda full-text en español sobre content
    await queryInterface.sequelize.query(`
      CREATE INDEX ai_chunks_content_tsvector_idx
      ON "AIChunks"
      USING gin (to_tsvector('spanish', "content"));
    `);

    // Índice GIN para búsqueda en el array de keywords
    await queryInterface.sequelize.query(`
      CREATE INDEX ai_chunks_keywords_gin_idx
      ON "AIChunks"
      USING gin ("keywords");
    `);

    console.log("✅ Tabla AIChunks creada exitosamente con índices vectoriales");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AIChunks");
  }
};
