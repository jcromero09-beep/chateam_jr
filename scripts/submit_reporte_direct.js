// Submit plantilla 23 directamente a Meta Graph API
const axios = require('axios');
const { Sequelize } = require('sequelize');
const dbConfig = require('../dist/config/database').default;

async function run() {
  const seq = new Sequelize(dbConfig);

  // 1. Obtener template
  const [templates] = await seq.query(`
    SELECT id, name, category, language, "parameterFormat",
           "headerType", "headerContent", "bodyContent", "footerContent",
           buttons, "variablesCount", "variableExamples"
    FROM "WhatsAppTemplates" WHERE id = 23
  `);
  const template = templates[0];
  if (!template) { console.error('❌ Template 23 no existe'); await seq.close(); process.exit(1); }
  console.log('📋 Template:', template.name, template.status);

  // 2. Obtener whatsapp con token
  const [whatsapps] = await seq.query(`
    SELECT id, name, "facebookUserId", "tokenMeta"
    FROM "Whatsapps" WHERE id = 10
  `);
  const wa = whatsapps[0];
  if (!wa || !wa.tokenMeta || !wa.facebookUserId) {
    console.error('❌ Conexión id=10 sin token o WABA ID');
    await seq.close(); process.exit(1);
  }

  // 3. Construir payload
  const components = [
    {
      type: "BODY",
      text: template.bodyContent,
      example: { body_text: [template.variableExamples] }
    }
  ];

  const payload = {
    name: template.name,
    language: template.language,
    category: template.category,
    parameter_format: "POSITIONAL",
    components
  };

  console.log('📤 Payload a Meta:', JSON.stringify(payload, null, 2));

  // 4. Llamar a Meta
  const url = `https://graph.facebook.com/v24.0/${wa.facebookUserId}/message_templates`;
  try {
    const { data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${wa.tokenMeta}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Meta response:', JSON.stringify(data, null, 2));

    // 5. Actualizar BD
    await seq.query(`
      UPDATE "WhatsAppTemplates" SET "metaTemplateId" = :metaId, status = :status, "updatedAt" = NOW() WHERE id = 23
    `, { replacements: { metaId: data.id, status: data.status || 'PENDING' } });
    console.log('✅ BD actualizada');
  } catch (e) {
    console.error('❌ Error Meta:', e.response?.status);
    console.error('Detalles:', JSON.stringify(e.response?.data, null, 2));
  } finally {
    await seq.close();
  }
}

run();
