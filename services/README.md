# HomesDrives EC2 Services

Services that need a real server (FFmpeg, long jobs, ML models) run on **EC2**. Vercel is fine for static UI and light APIs, but **AI Reels Maker must run on EC2**.

## What runs where

| Component | Where | Port |
|-----------|--------|------|
| **Next.js app** (includes Reels Maker UI + API) | EC2 | 3000 |
| **InsightFace / Building vision** | EC2 | 8000 |
| Preview / marketing (optional) | Vercel | — |

Reels Maker code lives in the main app (`app/reels-maker/`, `lib/reels-maker/`). There is no separate Python microservice for reels — you deploy the **whole repo** on EC2 and run `pnpm build && pnpm start`.

## Folder layout

```
services/
  insightface-api/   ← Python FastAPI (faces + buildings)
  reels-maker/       ← EC2 deployment guide for reels (runs inside Next.js)
ecosystem.config.cjs ← PM2: starts both services from repo root
```

## Quick start (EC2 Ubuntu)

See **[reels-maker/README.md](./reels-maker/README.md)** for the full step-by-step console commands.

After first setup, every deploy is:

```bash
cd ~/HomesDrives          # your clone path
git pull
pnpm install
pnpm build
pm2 restart ecosystem.config.cjs
```

## Environment

Copy `.env.sample` to `.env` in the **repo root** on EC2. Required for reels:

- `GEMINI_API_KEY`
- `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_ENDPOINT`
- `INSIGHTFACE_API_URL=http://127.0.0.1:8000`
- `NEXT_PUBLIC_APP_URL=https://your-domain`

Optional: `FFMPEG_PATH` if system ffmpeg is not on PATH.
