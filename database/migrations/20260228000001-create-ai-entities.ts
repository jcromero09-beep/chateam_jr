import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AIEntities", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      key: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        comment: "Identificador único del modelo (ej: gpt-4o, claude-sonnet-4)"
      },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
        comment: "Nombre legible del modelo"
      },
      engine: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "Proveedor: openai, anthropic, google, xai, deepseek, openrouter, mistral, groq"
      },
      type: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: "Tipo: text, image, video, audio, embedding, realtime"
      },
      inputPrice: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        defaultValue: 0,
        comment: "Precio por 1K tokens de entrada en USD"
      },
      outputPrice: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
        defaultValue: 0,
        comment: "Precio por 1K tokens de salida en USD"
      },
      maxTokens: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Máximo de tokens soportados por el modelo"
      },
      capabilities: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Capacidades del modelo: vision, tools, streaming, etc."
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "active",
        comment: "Estado: active, deprecated, beta"
      },
      isSelected: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Si el modelo está seleccionado como preferido"
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: "Metadatos adicionales del modelo"
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

    // Índice compuesto engine + type para búsquedas por proveedor y tipo
    await queryInterface.addIndex("AIEntities", ["engine", "type"], {
      name: "ai_entities_engine_type_idx"
    });

    // Índice por status para filtrar modelos activos
    await queryInterface.addIndex("AIEntities", ["status"], {
      name: "ai_entities_status_idx"
    });

    console.log("✅ Tabla AIEntities creada exitosamente");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AIEntities");
  }
};
