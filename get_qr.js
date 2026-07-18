const sequelize = require('./database').default;
const axios = require('axios');

const GRAPH_API_VERSION = 'v24.0';

(async () => {
  await sequelize.authenticate();

  // Obtener la conexión más reciente
  const [[conn]] = await sequelize.query(`
    SELECT * FROM "Whatsapps"
    WHERE provider = 'meta' AND channel = 'meta'
    ORDER BY id DESC LIMIT 1
  `);

  const token = conn?.tokenMeta;
  const phoneNumberId = conn?.phoneNumberId;

  console.log('Token:', token?.substring(0, 20) + '...');
  console.log('Phone Number ID:', phoneNumberId);
  console.log('Platform Type (del lookup anterior): CLOUD_API\n');

  if (!token || !phoneNumberId) {
    console.log('Faltan datos');
    await sequelize.close();
    return;
  }

  // Intentar obtener QR code
  try {
    console.log('Intentando GET /{phoneNumberId}/qr_code...');
    const { data: qrData } = await axios.get(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/qr_code`,
      { params: { access_token: token } }
    );
    console.log('QR Code Response:');
    console.log(JSON.stringify(qrData, null, 2));
  } catch (err) {
    console.log('Error QR:', err.response?.data?.error?.message || err.message);
  }

  // Intentar pairing code
  try {
    console.log('\nIntentando POST /{phoneNumberId}/request_pairing_code...');
    const { data: pairingData } = await axios.post(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/request_pairing_code`,
      {},
      { params: { access_token: token } }
    );
    console.log('Pairing Code Response:');
    console.log(JSON.stringify(pairingData, null, 2));
  } catch (err) {
    console.log('Error Pairing:', err.response?.data?.error?.message || err.message);
  }

  await sequelize.close();
})();
