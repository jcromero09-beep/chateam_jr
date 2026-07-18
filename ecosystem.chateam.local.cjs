// Ecosystem LOCAL para exponer chateam_jr en padeldev.codigo.plus (perfil lean: 1 nodo + worker).
// Las variables de infraestructura se inyectan aqui. bootstrap.ts usa dotenv SIN override,
// por lo que estas tienen prioridad sobre el .env del backup (que solo aporta secretos/API keys).
const NODE22 = '/home/jcromero09/.nvm/versions/node/v22.22.0/bin/node';
const CWD = '/home/jcromero09/chateam_jr';

const infraEnv = {
  NODE_ENV: 'production',
  DB_DIALECT: 'postgres',
  DB_HOST: '127.0.0.1',
  DB_PORT: '5434',
  DB_NAME: 'chateamjr',
  DB_USER: 'atendimento',
  DB_PASS: 'atendimento_ch4t3am_2026',
  DB_POOL_MAX: '25',
  DB_POOL_MIN: '2',
  REDIS_URI: 'redis://:ch4t3am_redis_2026@127.0.0.1:6390',
  REDIS_URL: 'redis://:ch4t3am_redis_2026@127.0.0.1:6390',
  REDIS_HOST: '127.0.0.1',
  REDIS_PORT: '6390',
  REDIS_PASSWORD: 'ch4t3am_redis_2026',
  FRONTEND_URL: 'https://padeldev.codigo.plus',
  BACKEND_URL: 'https://padeldev.codigo.plus/be',
  APP_URL: 'https://padeldev.codigo.plus',
};

module.exports = {
  apps: [
    {
      name: 'chateam-node',
      script: NODE22,
      args: '--max-old-space-size=2048 --import tsx/esm server-distributed.ts',
      interpreter: 'none',
      cwd: CWD,
      env: { ...infraEnv, NODE_ID: 'node-1', PORT: '3010', MAX_SESSIONS: '250' },
      max_memory_restart: '2560M',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
    },
    {
      name: 'chateam-worker',
      script: NODE22,
      args: '--max-old-space-size=1024 --import tsx/esm worker.ts',
      interpreter: 'none',
      cwd: CWD,
      env: { ...infraEnv, NODE_ID: 'worker', DISTRIBUTED_MODE: 'true', DB_POOL_MAX: '10' },
      max_memory_restart: '1280M',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
    },
  ],
};
