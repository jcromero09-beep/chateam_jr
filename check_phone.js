const sequelize = require('./database').default;
const axios = require('axios');

(async () => {
  await sequelize.authenticate();

  const [[conn]] = await sequelize.query(`SELECT "tokenMeta" FROM "Whatsapps" WHERE id = 19`);
  const token = conn?.tokenMeta;
  const phoneNumberId = '1015859614941800';

  if (!token) {
    console.log('No token found');
    await sequelize.close();
    return;
  }

  try {
    // Verificar el número directamente
    const { data } = await axios.get(`https://graph.facebook.com/v24.0/${phoneNumberId}`, {
      params: { access_token: token }
    });
    console.log('Estado del número:');
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.log('Error:', err.response?.data || err.message);
  }

  await sequelize.close();
})();
