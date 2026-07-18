import { QueryInterface, DataTypes } from "sequelize";

/**
 * Migracion: agregar campos de provider para Email Marketing.
 *
 * - ContactLists: + provider, + providerListId
 *   (mantiene acelleListUid como legacy)
 * - email_templates: + provider, + providerTemplateId, + type
 * - EmailCampaigns: + providerCampaignId ya existe; agregamos sendIntervalSeconds y dispatchMode
 *
 * BD SAGRADA: solo ADD COLUMN. Sin DROP, sin TRUNCATE, sin DELETE.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // ---------- ContactLists ----------
    const contactListsCols = await queryInterface.describeTable("ContactLists");

    if (!contactListsCols["provider"]) {
      await queryInterface.addColumn("ContactLists", "provider", {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Provider activo: acelle | listmonk"
      });
    }

    if (!contactListsCols["providerListId"]) {
      await queryInterface.addColumn("ContactLists", "providerListId", {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "ID externo en el provider (Listmonk: numerico, Acelle: UUID)"
      });
    }

    // Backfill: si la lista ya tiene acelleListUid, copiar a providerListId/provider
    await queryInterface.sequelize.query(`
      UPDATE "ContactLists"
      SET provider = 'acelle', "providerListId" = "acelleListUid"
      WHERE "acelleListUid" IS NOT NULL
        AND "acelleListUid" <> ''
        AND ("providerListId" IS NULL OR "providerListId" = '')
    `);

    // ---------- email_templates ----------
    const tplCols = await queryInterface.describeTable("email_templates");

    if (!tplCols["provider"]) {
      await queryInterface.addColumn("email_templates", "provider", {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Provider activo: acelle | listmonk"
      });
    }

    if (!tplCols["providerTemplateId"]) {
      await queryInterface.addColumn("email_templates", "providerTemplateId", {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "ID externo de la plantilla en el provider"
      });
    }

    if (!tplCols["type"]) {
      await queryInterface.addColumn("email_templates", "type", {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "campaign",
        comment: "campaign | tx"
      });
    }

    // ---------- EmailCampaigns ----------
    const campCols = await queryInterface.describeTable("email_campaigns");

    if (!campCols["sendIntervalSeconds"]) {
      await queryInterface.addColumn("email_campaigns", "sendIntervalSeconds", {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 0,
        comment: "Segundos entre envios. >0 = modo individual via queue"
      });
    }

    if (!campCols["dispatchMode"]) {
      await queryInterface.addColumn("email_campaigns", "dispatchMode", {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "provider_native",
        comment: "provider_native | individual_queue"
      });
    }

    // Crear indices para busquedas frecuentes
    try {
      await queryInterface.addIndex("ContactLists", ["provider", "providerListId"], {
        name: "idx_contactlists_provider"
      });
    } catch {
      // ya existe
    }

    try {
      await queryInterface.addIndex("email_templates", ["companyId", "type", "status"], {
        name: "idx_email_templates_company_type_status"
      });
    } catch {
      // ya existe
    }
  },

  down: async (queryInterface: QueryInterface) => {
    // BD SAGRADA: down NO borra columnas. Solo limpia indices.
    try {
      await queryInterface.removeIndex("ContactLists", "idx_contactlists_provider");
    } catch {
      // ignore
    }
    try {
      await queryInterface.removeIndex(
        "email_templates",
        "idx_email_templates_company_type_status"
      );
    } catch {
      // ignore
    }
  }
};
