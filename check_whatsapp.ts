import { QueryTypes } from 'sequelize';
import sequelize from './database';

async function check() {
  // Todas las conexiones Meta
  const metas = await sequelize.query(
    `SELECT id, name, "phoneNumberId", provider, channel, "companyId", status FROM "Whatsapps" WHERE provider = 'meta' ORDER BY id DESC LIMIT 20`,
    { type: QueryTypes.SELECT }
  );
  console.log('Whatsapps provider=meta:', metas.length);
  console.log(JSON.stringify(metas, null, 2));

  // Todas las conexiones channel=cloud_api
  const cloud = await sequelize.query(
    `SELECT id, name, "phoneNumberId", provider, channel, "companyId", status FROM "Whatsapps" WHERE channel = 'cloud_api' ORDER BY id DESC LIMIT 20`,
    { type: QueryTypes.SELECT }
  );
  console.log('\nWhatsapps channel=cloud_api:', cloud.length);
  console.log(JSON.stringify(cloud, null, 2));

  // Todas las conexiones que empiezan con 5594
  const phones = await sequelize.query(
    `SELECT id, name, "phoneNumberId", provider, channel, "companyId", status FROM "Whatsapps" WHERE "phoneNumberId" LIKE '5594%' ORDER BY id DESC LIMIT 20`,
    { type: QueryTypes.SELECT }
  );
  console.log('\nWhatsapps phoneNumberId LIKE 5594%:', phones.length);
  console.log(JSON.stringify(phones, null, 2));

  // Todas las conexiones - primeras 10
  const all = await sequelize.query(
    `SELECT id, name, "phoneNumberId", provider, channel, "companyId", status FROM "Whatsapps" ORDER BY id DESC LIMIT 10`,
    { type: QueryTypes.SELECT }
  );
  console.log('\nUltimas 10 conexiones Whatsapps:');
  console.log(JSON.stringify(all, null, 2));

  await sequelize.close();
}

check().catch(e => { console.error(e.message); process.exit(1); });
