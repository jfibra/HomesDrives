/**
 * PM2 process file — run from repo root:
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *
 * EC2 runs vision + reels workers only. Main Next.js app stays on Vercel.
 */
module.exports = {
  apps: [
    {
      name: 'insightface-api',
      cwd: './services/insightface-api',
      script: '.venv/bin/uvicorn',
      args: 'main:app --host 0.0.0.0 --port 8000',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 10,
    },
    {
      name: 'reels-api',
      cwd: '.',
      script: 'npx',
      args: 'tsx --tsconfig tsconfig.json services/reels-api/server.ts',
      interpreter: 'none',
      env: {
        NODE_ENV: 'production',
        REELS_API_PORT: '8001',
      },
      autorestart: true,
      max_restarts: 10,
    },
  ],
}
