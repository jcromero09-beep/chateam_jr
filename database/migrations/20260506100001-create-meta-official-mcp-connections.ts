import { QueryInterface, DataTypes } from "sequelize";

/**
 * Tabla de conexiones MCP oficial de Meta Ads (https://mcp.facebook.com/ads).
 *
 * BD SAGRADA: ADD-only, idempotente. Nunca DROP/DELETE.
 *
 * Una fila por (companyId) — cada empresa tiene su propio token MCP, aunque
 * todas usan el mismo client_id global de la app Meta de ChatEAM
 * (configurada en META_OFFICIAL_MCP_CLIENT_ID).
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables: string[]) => tables.includes("MetaOfficialMcpConnections"));

    if (!tableExists) {
      await queryInterface.createTable("MetaOfficialMcpConnections", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        provider: {
          type: DataTypes.STRING(40),
          allowNull: false,
          defaultValue: "meta_official_mcp"
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "not_connected",
          comment: "not_connected | pending | connected | error"
        },
        mcpServerUrl: {
          type: DataTypes.STRING(255),
          allowNull: false,
          defaultValue: "https://mcp.facebook.com/ads"
        },
        // PKCE + OAuth state (válidos solo durante el flow OAuth)
        oauthState: {
          type: DataTypes.STRING(128),
          allowNull: true
        },
        codeVerifier: {
          type: DataTypes.STRING(255),
          allowNull: true
        },
        // Tokens MCP (se almacenan en plano por ahora; cifrar AES-256 en V2 — ver SECURITY_DEBT.md)
        accessToken: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        refreshToken: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: true
        },
        scopes: {
          type: DataTypes.JSONB,
          allowNull: true,
          defaultValue: []
        },
        // Estado operativo del cliente MCP
        lastToolsListAt: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Última vez que tools/list respondió OK"
        },
        lastConnectedAt: {
          type: DataTypes.DATE,
          allowNull: true
        },
        lastError: {
          type: DataTypes.TEXT,
          allowNull: true
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

      await queryInterface.addIndex("MetaOfficialMcpConnections", ["companyId"], {
        name: "idx_meta_official_mcp_company",
        unique: true
      });
      await queryInterface.addIndex("MetaOfficialMcpConnections", ["status"], {
        name: "idx_meta_official_mcp_status"
      });
      await queryInterface.addIndex("MetaOfficialMcpConnections", ["oauthState"], {
        name: "idx_meta_official_mcp_oauth_state"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("MetaOfficialMcpConnections");
  }
};
