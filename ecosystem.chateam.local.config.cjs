// Ecosystem LOCAL para exponer chateam_jr en padeldev.codigo.plus (perfil lean: 1 nodo + worker).
// Las variables de infraestructura se inyectan aqui. bootstrap.ts usa dotenv SIN override,
// por lo que estas tienen prioridad sobre el .env del backup (que solo aporta secretos/API keys).
const NODE22 = '/home/jcromero09/.nvm/versions/node/v22.22.0/bin/node';
// El cwd sale de la UBICACIÓN DEL PROPIO FICHERO, no de una ruta fija.
//
// Estaba hardcodeado a /home/jcromero09/chateam_jr, que es el árbol de
// DESARROLLO. Con la frontera de producción (checkout aparte en /opt/chateam)
// eso significaba que arrancar desde el checkout de producción habría hecho que
// PM2 ejecutase igualmente el código de desarrollo — justo lo contrario de lo
// que se pretende, y sin ningún síntoma visible.
//
// Con __dirname, el mismo fichero versionado sirve en los dos árboles y cada uno
// arranca el suyo.
const CWD = __dirname;

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
// `--require tsx/cjs` es OBLIGATORIO además de `--import tsx/esm`.
//
// El proyecto mezcla ESM e importaciones CJS: `queues.ts` hace
// `require('./jobs/EmailCampaign')` sobre ficheros .ts, y sin el hook de CJS eso
// falla con `Cannot find module './jobs/EmailCampaign'` aunque el fichero exista
// y esté versionado.
//
// Faltaba en este fichero. Los procesos que corrían en producción SÍ lo llevaban
// —se ve en sus args— lo que prueba que no se habían arrancado desde aquí. Al
// arrancar el worker con este ecosystem, entró en bucle de reinicio: cargaba 5
// colas en vez de 8 y moría con "Error al iniciar el worker".
      args: '--max-old-space-size=2048 --import tsx/esm --require tsx/cjs server-distributed.ts',
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
      args: '--max-old-space-size=1024 --import tsx/esm --require tsx/cjs worker.ts',
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
