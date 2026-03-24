import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AIDocuments", {
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
        comment: "Empresa propietaria del documento"
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Título del documento"
      },
      sourceType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: "Tipo de fuente: pdf, txt, xlsx, url, ticket, qa_pairs"
      },
      sourceUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "URL de origen si el documento fue importado desde web"
      },
      filePath: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Ruta del archivo en el sistema de archivos"
      },
      fileSizeBytes: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: "Tamaño del archivo en bytes"
      },
      chunksCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Cantidad de chunks generados"
      },
      tokensCount: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Total de tokens del documento"
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "pending",
        comment: "Estado: pending, processing, processed, error"
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Mensaje de error si el procesamiento falló"
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Metadatos adicionales del documento"
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Fecha de procesamiento exitoso"
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    });

    // Índice por companyId para multi-tenancy
    await queryInterface.addIndex("AIDocuments", ["companyId"], {
      name: "ai_documents_company_id_idx"
    });

    // Índice por status para filtrar por estado de procesamiento
    await queryInterface.addIndex("AIDocuments", ["status"], {
      name: "ai_documents_status_idx"
    });

    console.log("✅ Tabla AIDocuments creada exitosamente");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AIDocuments");
  }
};
