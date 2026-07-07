# HomesDrives EC2 Services

Heavy workloads run on **EC2**. The main Next.js app stays on **Vercel**.

## What runs where

| Component | Where | Port |
|-----------|--------|------|
| **Next.js app** (UI) | Vercel | 443 |
| **InsightFace / Buildings** | EC2 | 8000 |
| **AI Reels Maker API** | EC2 | 8001 |

## Architectureee (same pattern for both AI services)

```
Vercel (drive.homes.ph)
    │
    ├─ People/Faces ──► INSIGHTFACE_API_URL ──► EC2 :8000
    │
    └─ Reels Maker UI ──► NEXT_PUBLIC_REELS_API_URL ──► EC2 :8001
```

## Folder layout

```
services/
  insightface-api/   ← Python FastAPI (faces + buildings)
  reels-api/         ← Node reels worker (FFmpeg, yt-dlp, Gemini)
ecosystem.config.cjs ← PM2 starts both on EC2
```

## EC2 deploy (after git pull)

```bash
cd ~/HomesDrives
git pull
source ~/.nvm/nvm.sh && nvm use 20
npm install
pm2 restart ecosystem.config.cjs
```

See **[reels-api/README.md](./reels-api/README.md)** for full reels setup and Vercel env vars.

## Vercel env vars (reels)

```
NEXT_PUBLIC_REELS_API_URL=http://YOUR_EC2_IP:8001
REELS_API_URL=http://YOUR_EC2_IP:8001
REELS_API_SECRET=your-shared-secret
```

Redeploy Vercel after changing these.
