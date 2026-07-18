import { QueryInterface, DataTypes } from "sequelize";

/**
 * CommentResponseSettings — configuración de modo de respuesta a comentarios
 * FB/IG por conexión (whatsappId) con override opcional por post (socialPostId).
 *
 * BD SAGRADA: crea tabla/índices si faltan, no destruye datos.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableName = "CommentResponseSettings";
    const tables = await queryInterface.showAllTables();

    if (!tables.includes(tableName)) {
      await queryInterface.createTable(tableName, {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        whatsappId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Whatsapps", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        socialPostId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "UGCSocialPosts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        mode: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "manual"
        },
        autoMessage: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        aiAgentConfigId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "AIAgentConfigs", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW
        }
      });
    }

    // Índice multi-tenancy
    await queryInterface.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "idx_comment_response_settings_company"
       ON "${tableName}" ("companyId");`
    );

    // UNIQUE parcial: un solo setting por conexión (sin override de post)
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_comment_response_settings_connection"
       ON "${tableName}" ("companyId", "whatsappId")
       WHERE "socialPostId" IS NULL;`
    );

    // UNIQUE parcial: un solo setting por post (override)
    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_comment_response_settings_post"
       ON "${tableName}" ("companyId", "whatsappId", "socialPostId")
       WHERE "socialPostId" IS NOT NULL;`
    );
  },

  down: async (queryInterface: QueryInterface) => {
    // Solo para rollback en desarrollo
    await queryInterface.dropTable("CommentResponseSettings");
  }
};
