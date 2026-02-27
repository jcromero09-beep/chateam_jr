module.exports = {
  apps: [
    {
      name: "chateam-backend",
      cwd: "/home/deploy/chateam_jr",
      script: "npx",
      args: "tsx server-simple.ts",
      interpreter: "none",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=2048"
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "/home/deploy/.pm2/logs/chateam-backend-error.log",
      out_file: "/home/deploy/.pm2/logs/chateam-backend-out.log"
    },
    {
      name: "chateam-worker",
      cwd: "/home/deploy/chateam_jr",
      script: "npx",
      args: "tsx worker.ts",
      interpreter: "none",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=1024"
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      error_file: "/home/deploy/.pm2/logs/chateam-worker-error.log",
      out_file: "/home/deploy/.pm2/logs/chateam-worker-out.log"
    },
    {
      name: "chateam-frontend",
      cwd: "/home/deploy/chateam_jr/frontend",
      script: "node_modules/.bin/vite",
      args: "--host 0.0.0.0",
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      },
      instances: 1,
      autorestart: true,
      watch: false,
      error_file: "/home/deploy/.pm2/logs/chateam-frontend-error.log",
      out_file: "/home/deploy/.pm2/logs/chateam-frontend-out.log"
    }
  ]
};
