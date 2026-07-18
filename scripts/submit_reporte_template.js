// Submit plantilla 23 a Meta usando endpoint interno
const axios = require('axios');

async function getAdminToken() {
  // Loguear como admin para obtener token
  const { Sequelize } = require('sequelize');
  const dbConfig = require('../dist/config/database').default;
  const seq = new Sequelize(dbConfig);
  const [rows] = await seq.query(`
    SELECT id, email, profile, "companyId" FROM "Users"
    WHERE "companyId" = 1 AND profile = 'admin' AND super = true
    ORDER BY id LIMIT 1
  `);
  await seq.close();
  return rows[0];
}

async function run() {
  const SubmitTemplateToMetaService = require('../dist/services/WhatsAppTemplateServices/SubmitTemplateToMetaService').default;

  try {
    const result = await SubmitTemplateToMetaService({
      templateId: 23,
      companyId: 1,
      whatsappId: 10
    });
    console.log('✅ Enviada a Meta:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('❌ Error:', e.message);
    if (e.metaErrorDetails) {
      console.error('Meta Details:', JSON.stringify(e.metaErrorDetails, null, 2));
    }
    process.exit(1);
  }
  process.exit(0);
}

run();
