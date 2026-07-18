import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Asegurar que la extensión pgvector esté habilitada
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // Crear la tabla sin la columna vector
    await queryInterface.createTable("AISemanticCache", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Empresa propietaria de esta entrada de caché"
      },
      queryText: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Texto original de la consulta del usuario"
      },
      response: {
        type: DataTypes.TEXT,
        allowNull: false,
        comment: "Respuesta cacheada"
      },
      modelUsed: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Modelo IA utilizado para generar la respuesta"
      },
      agentUsed: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Agente que generó la respuesta"
      },
      tokensInput: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Tokens de entrada consumidos"
      },
      tokensOutput: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Tokens de salida generados"
      },
      costUsd: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        defaultValue: 0,
        comment: "Costo en USD de la generación original"
      },
      hitCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "Cantidad de veces que se reutilizó esta entrada"
      },
      lastHitAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Última vez que se usó esta entrada de caché"
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Fecha de expiración del caché"
      }
    });

    // Agregar columna vector(1536) para el embedding de la consulta
    await queryInterface.sequelize.query(`
      ALTER TABLE "AISemanticCache" ADD COLUMN "queryEmbedding" vector(1536);
    `);

    // Índice por companyId para multi-tenancy
    await queryInterface.addIndex("AISemanticCache", ["companyId"], {
      name: "ai_semantic_cache_company_id_idx"
    });

    // Índice IVFFlat para búsqueda vectorial de similitud semántica
    await queryInterface.sequelize.query(`
      CREATE INDEX ai_semantic_cache_query_embedding_ivfflat_idx
      ON "AISemanticCache"
      USING ivfflat ("queryEmbedding" vector_cosine_ops)
      WITH (lists = 100);
    `);

    // Índice por expiresAt para limpieza de caché expirado
    await queryInterface.addIndex("AISemanticCache", ["expiresAt"], {
      name: "ai_semantic_cache_expires_at_idx"
    });

    console.log("✅ Tabla AISemanticCache creada exitosamente con índice vectorial");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AISemanticCache");
  }
};
