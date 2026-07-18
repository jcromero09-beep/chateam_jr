import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.createTable("CampaignMessages", {
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
        allowNull: false
      },
      contactId: {
        type: DataTypes.INTEGER,
        references: { model: "Contacts", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      messageId: {
        type: DataTypes.INTEGER,
        references: { model: "Messages", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: true
      },
      ticketId: {
        type: DataTypes.INTEGER,
        references: { model: "Tickets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: true
      },
      whatsappId: {
        type: DataTypes.INTEGER,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      sourceId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "ID de la publicacion/anuncio de Facebook"
      },
      sourceType: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Tipo de fuente: AD, POST, CTWA, EXTERNAL_AD, etc."
      },
      sourceUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "URL del anuncio si existe"
      },
      headline: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Titulo del anuncio"
      },
      body: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Texto/descripcion del anuncio"
      },
      ctwaClid: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "Click-to-WhatsApp tracking ID unico"
      },
      thumbnail: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "URL de imagen del anuncio si existe"
      },
      channel: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Canal: facebook, instagram, whatsapp, meta"
      },
      rawData: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "JSON completo del referral para debug"
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    }).then(() => {
      return queryInterface.addIndex("CampaignMessages", ["companyId"]);
    }).then(() => {
      return queryInterface.addIndex("CampaignMessages", ["contactId"]);
    }).then(() => {
      return queryInterface.addIndex("CampaignMessages", ["messageId"]);
    }).then(() => {
      return queryInterface.addIndex("CampaignMessages", ["ctwaClid"]);
    }).then(() => {
      return queryInterface.addIndex("CampaignMessages", ["channel"]);
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("CampaignMessages");
  }
};
