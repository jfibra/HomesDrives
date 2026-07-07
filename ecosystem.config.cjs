/**
 * PM2 process file — run from repo root:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'insightface-api',
      cwd: './services/insightface-api',
      script: '.venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8000',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'homesdrives',
      cwd: '.',
      script: 'pnpm',
      args: 'start',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
}
