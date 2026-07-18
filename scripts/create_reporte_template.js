const { Sequelize } = require('sequelize');
const dbConfig = require('../dist/config/database').default;
const seq = new Sequelize(dbConfig);

async function run() {
  const [existing] = await seq.query("SELECT id, name, status FROM \"WhatsAppTemplates\" WHERE name = 'reporte_diario_sistema' AND \"companyId\" = 1");
  if (existing.length > 0) {
    console.log('⚠️ Ya existe:', JSON.stringify(existing[0]));
    await seq.close();
    return;
  }

  const bodyContent = "📊 *Reporte del Sistema*\n\n{{1}}\n\n_Generado automáticamente_";
  const variableExamples = ["TODO OK .- Reporte de prueba: Sistema enviado 5 notificaciones de atrasos a empleados. Sin errores."];

  const components = [
    {
      type: "BODY",
      text: bodyContent,
      example: { body_text: [variableExamples] }
    }
  ];

  const [result] = await seq.query(`
    INSERT INTO "WhatsAppTemplates" (
      name, category, language, "parameterFormat",
      "headerType", "headerContent", "bodyContent", "footerContent",
      buttons, "variablesCount", "variableExamples", "namedVariableExamples",
      components, status, "isActive", "usageCount",
      "companyId", "whatsappId", "createdAt", "updatedAt"
    ) VALUES (
      'reporte_diario_sistema', 'UTILITY', 'es', 'positional',
      'NONE', '', :bodyContent, '',
      '[]'::jsonb, 1, :variableExamples, '[]'::jsonb,
      :components, 'PENDING', true, 0,
      1, 10, NOW(), NOW()
    )
    RETURNING id, name, status, "variablesCount"
  `, {
    replacements: {
      bodyContent,
      variableExamples: JSON.stringify(variableExamples),
      components: JSON.stringify(components)
    }
  });

  console.log('✅ Plantilla creada:', JSON.stringify(result[0], null, 2));
  await seq.close();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
