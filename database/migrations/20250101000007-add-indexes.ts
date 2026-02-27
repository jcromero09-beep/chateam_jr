import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Índices para optimización de performance

    // Índices para Media
    await queryInterface.addIndex('Media', ['companyId', 'status']);
    await queryInterface.addIndex('Media', ['expiresAt', 'status']);
    await queryInterface.addIndex('Media', ['storageProvider', 'status']);

    // Índices para CompanyBilling
    await queryInterface.addIndex('CompanyBilling', ['companyId', 'status']);
    await queryInterface.addIndex('CompanyBilling', ['stripeCustomerId']);
    await queryInterface.addIndex('CompanyBilling', ['stripeSubscriptionId']);

    // Índices para Invoices
    await queryInterface.addIndex('Invoices', ['companyId', 'status']);
    await queryInterface.addIndex('Invoices', ['stripeInvoiceId']);
    await queryInterface.addIndex('Invoices', ['paidAt']);

    // Índices para Refunds
    await queryInterface.addIndex('Refunds', ['companyId', 'status']);
    await queryInterface.addIndex('Refunds', ['stripeRefundId']);

    // Índices para LeadSources
    await queryInterface.addIndex('LeadSources', ['leadId']);
    await queryInterface.addIndex('LeadSources', ['campaignId']);
    await queryInterface.addIndex('LeadSources', ['adId']);
    await queryInterface.addIndex('LeadSources', ['sourceKind']);

    // Índices para Audits
    await queryInterface.addIndex('Audits', ['campaignId']);
    await queryInterface.addIndex('Audits', ['companyId']);
    await queryInterface.addIndex('Audits', ['createdAt']);
    await queryInterface.addIndex('Audits', ['overallScore']);
  },

  down: async (queryInterface: QueryInterface) => {
    // Remover índices (si es necesario)
    await queryInterface.removeIndex('Media', 'media_company_id_status');
    await queryInterface.removeIndex('Media', 'media_expires_at_status');
    await queryInterface.removeIndex('CompanyBilling', 'company_billing_company_id_status');
    // ... otros índices
  }
};