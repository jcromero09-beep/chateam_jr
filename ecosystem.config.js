module.exports = {
  apps: [
    {
      name: 'node-1',
      script: 'npx tsx server-distributed.ts',
      cwd: '/home/deploy/chateam_jr',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        NODE_ID: 'node-1',
        PORT: '3001',
        MAX_SESSIONS: '250',
        REDIS_URI: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_URL: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '5000',
        REDIS_PASSWORD: 'ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS='
      },
      max_memory_restart: '5G',
      node_args: '--max-old-space-size=5120',
      autorestart: true,
      max_restarts: 30,
      exp_backoff_restart_delay: 100,
      restart_delay: 5000
    },
    {
      name: 'node-2',
      script: 'npx tsx server-distributed.ts',
      cwd: '/home/deploy/chateam_jr',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        NODE_ID: 'node-2',
        PORT: '3002',
        MAX_SESSIONS: '250',
        REDIS_URI: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_URL: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '5000',
        REDIS_PASSWORD: 'ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS='
      },
      max_memory_restart: '5G',
      node_args: '--max-old-space-size=5120',
      autorestart: true,
      max_restarts: 30,
      exp_backoff_restart_delay: 100,
      restart_delay: 5000
    },
    {
      name: 'chateam-worker',
      script: 'npx tsx worker.ts',
      cwd: '/home/deploy/chateam_jr',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        REDIS_URI: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_URL: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '5000',
        REDIS_PASSWORD: 'ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS='
      },
      max_memory_restart: '2G',
      autorestart: true,
      max_restarts: 30,
      exp_backoff_restart_delay: 100,
      restart_delay: 5000
    },
    {
      name: 'chateam-frontend',
      script: 'npx',
      args: 'vite preview --port 3000 --host',
      cwd: '/home/deploy/chateam_jr/frontend',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production'
      },
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 30,
      exp_backoff_restart_delay: 100,
      restart_delay: 5000
    }
  ]
};