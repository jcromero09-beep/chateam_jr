import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Smart Plug · Ola A] Tomacorrientes inteligentes WiFi (TP-Link Tapo).
 *
 * Multi-tenant: cada toma pertenece a una company. La credencial de la nube
 * Tapo se guarda cifrada (helpers/secretCrypto) — nunca en claro.
 * Ver docs/_consolidado/spec/modules/smart-plug-spec.md
 */
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("SmartPlugs", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      vendor: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "tapo" },
      model: { type: DataTypes.STRING(50), allowNull: true },
      // IP fija o hostname en la LAN del cliente. El pareo WiFi se hace con la
      // app Tapo; aca solo registramos la direccion resultante.
      host: { type: DataTypes.STRING(255), allowNull: false },
      macAddress: { type: DataTypes.STRING(50), allowNull: true },
      // device_id que reporta el propio dispositivo (get_device_info)
      vendorDeviceId: { type: DataTypes.STRING(255), allowNull: true },
      tapoEmail: { type: DataTypes.STRING(255), allowNull: false },
      // Cifrado AES-256-GCM con prefijo "enc:v1:" — ver helpers/secretCrypto.ts
      tapoPassword: { type: DataTypes.TEXT, allowNull: false },
      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "unknown" },
      relayOn: { type: DataTypes.BOOLEAN, allowNull: true },
      lastSeenAt: { type: DataTypes.DATE, allowNull: true },
      lastError: { type: DataTypes.TEXT, allowNull: true },
      lastEnergy: { type: DataTypes.JSONB, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });

    // Una misma direccion no se registra dos veces dentro de la misma company.
    await queryInterface.addConstraint("SmartPlugs", {
      fields: ["companyId", "host"],
      type: "unique",
      name: "uq_smart_plugs_company_host"
    });
    await queryInterface.addIndex("SmartPlugs", ["companyId"], {
      name: "idx_smart_plugs_company"
    });
    await queryInterface.addIndex("SmartPlugs", ["companyId", "status"], {
      name: "idx_smart_plugs_company_status"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("SmartPlugs");
  }
};
