const sequelize = require('./database').default;
const axios = require('axios');

const GRAPH_API_VERSION = 'v24.0';

(async () => {
  await sequelize.authenticate();

  // Obtener la conexión #19 (smart - el nuevo número)
  const [[conn]] = await sequelize.query(`
    SELECT * FROM "Whatsapps" WHERE id = 19
  `);

  console.log('Conexión #19:', {
    name: conn.name,
    phoneNumberId: conn.phoneNumberId,
    wabaId: conn.facebookUserId,
    tokenMeta: conn.tokenMeta?.substring(0, 30) + '...'
  });

  // Verificar estado del WABA
  const wabaId = conn.facebookUserId;
  const token = conn.tokenMeta;

  if (wabaId && token) {
    try {
      // Obtener webhooks del WABA
      const { data } = await axios.get(`https://graph.facebook.com/${GRAPH_API_VERSION}/${wabaId}/subscribed_apps`, {
        params: { access_token: token }
      });
      console.log('\nApps suscritas al WABA:');
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.log('Error consultando WABA:', err.response?.data || err.message);
    }
  }

  await sequelize.close();
})();
