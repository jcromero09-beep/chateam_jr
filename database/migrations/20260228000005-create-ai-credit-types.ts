import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AICreditTypes", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      key: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "Identificador único del tipo de crédito"
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Nombre legible del tipo de crédito"
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Descripción del tipo de crédito"
      },
      unit: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "unit",
        comment: "Unidad de medida: unit, token, minute, character, second"
      },
      defaultCost: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 0,
        comment: "Costo por defecto por unidad en créditos"
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: "Si este tipo de crédito está activo"
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

    // Seed data: tipos de créditos granulares iniciales
    await queryInterface.bulkInsert("AICreditTypes", [
      {
        key: "message",
        name: "Mensaje IA",
        description: "Crédito por mensaje de texto generado por IA",
        unit: "unit",
        defaultCost: 1.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "image",
        name: "Generación de imagen",
        description: "Crédito por imagen generada por IA",
        unit: "unit",
        defaultCost: 5.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "video",
        name: "Generación de video",
        description: "Crédito por video generado por IA",
        unit: "unit",
        defaultCost: 20.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "audio_minute",
        name: "Audio por minuto",
        description: "Crédito por minuto de audio transcrito o generado",
        unit: "minute",
        defaultCost: 2.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "tts_character",
        name: "TTS por carácter",
        description: "Crédito por carácter convertido a voz (Text-to-Speech)",
        unit: "character",
        defaultCost: 0.000100,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "rag_query",
        name: "Consulta RAG",
        description: "Crédito por consulta de Retrieval Augmented Generation",
        unit: "unit",
        defaultCost: 2.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "embedding_token",
        name: "Token de embedding",
        description: "Crédito por token procesado para embeddings",
        unit: "token",
        defaultCost: 0.000010,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "agent_execution",
        name: "Ejecución de agente",
        description: "Crédito por ejecución completa de un agente IA",
        unit: "unit",
        defaultCost: 3.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "kb_document",
        name: "Documento Knowledge Base",
        description: "Crédito por documento procesado e indexado en la base de conocimiento",
        unit: "unit",
        defaultCost: 10.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "vision_analysis",
        name: "Análisis de visión",
        description: "Crédito por análisis de imagen con modelo de visión",
        unit: "unit",
        defaultCost: 3.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: "pdf_processing",
        name: "Procesamiento de PDF",
        description: "Crédito por procesamiento y extracción de contenido de PDF",
        unit: "unit",
        defaultCost: 5.000000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    console.log("✅ Tabla AICreditTypes creada con 11 tipos de crédito iniciales");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AICreditTypes");
  }
};
