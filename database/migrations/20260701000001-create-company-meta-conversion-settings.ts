import { QueryInterface, DataTypes } from "sequelize";

/**
 * Gate central por empresa para conversiones Meta CAPI.
 *
 * BD SAGRADA: migración aditiva. No borra ni modifica eventos históricos.
 * Si no existe una fila para un evento, el código aplica defaults seguros.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table: any) =>
      typeof table === "string" ? table : table.tableName
    );

    if (!tableNames.includes("CompanyMetaConversionSettings")) {
      await queryInterface.createTable("CompanyMetaConversionSettings", {
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
        eventKey: {
          type: DataTypes.STRING,
          allowNull: false
        },
        enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true
        },
        conversionName: {
          type: DataTypes.STRING,
          allowNull: true
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true
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

    await queryInterface.addIndex("CompanyMetaConversionSettings", ["companyId"], {
      name: "idx_company_meta_conversion_settings_company"
    }).catch(() => undefined);

    await queryInterface.addIndex("CompanyMetaConversionSettings", ["eventKey"], {
      name: "idx_company_meta_conversion_settings_event"
    }).catch(() => undefined);

    await queryInterface.addIndex(
      "CompanyMetaConversionSettings",
      ["companyId", "eventKey"],
      {
        name: "uniq_company_meta_conversion_settings_company_event",
        unique: true
      }
    ).catch(() => undefined);
  },

  down: async () => {
    // no-op intencional: no eliminamos configuración de producción
  }
};
