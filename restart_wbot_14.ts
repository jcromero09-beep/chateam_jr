import jwt from "jsonwebtoken";
const { sign } = jwt;
import authConfig from './config/auth';
import axios from 'axios';

(async () => {
  // 1) Firmar JWT como admin de company 8 (Orlando, id=11)
  const token = sign(
    {
      username: 'Orlando-asesor comercial',
      profile: 'admin',
      id: 11,
      companyId: 8,
      super: false,
      sid: 'restart-diagnostic-' + Date.now()
    },
    authConfig.secret,
    { expiresIn: '5m' } as any
  );

  console.log('[restart] JWT firmado, llamando POST /whatsapp-restart/ ...');

  // 2) Llamar al endpoint contra el balanceador local
  // PM2 expone backend en NGINX -> https://appro.chateam.ws/
  const url = 'https://appro.chateam.ws/whatsapp-restart/';
  try {
    const { data, status } = await axios.post(url, {}, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000
    });
    console.log(`[restart] HTTP ${status} →`, data);
  } catch (err: any) {
    console.log('[restart] ERROR HTTP', err.response?.status, err.response?.data || err.message);
  }
})();
