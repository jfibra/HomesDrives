# AI Reels Maker API (EC2 worker)

FFmpeg + video jobs run on EC2, like InsightFace. The Vercel site calls this service.

## Architecture

```
Browser → Vercel (UI at drive.homes.ph)
              ↓ direct API calls (NEXT_PUBLIC_REELS_API_URL)
         EC2 :8001 (reels-api)
```

InsightFace uses the same pattern on port `8000`.

## EC2 setup

### 1. Pull latest code

```bash
cd ~/HomesDrives
git pull
source ~/.nvm/nvm.sh && nvm use 20
YOUTUBE_DL_SKIP_PYTHON_CHECK=1 npm install
```

### 2. Configure `.env` in repo root

Copy from Vercel + add reels settings:

```bash
# Reels worker
REELS_API_PORT=8001
REELS_API_ALLOWED_ORIGINS=https://drive.homes.ph,https://your-app.vercel.app
REELS_API_SECRET=generate-a-long-random-secret

# Same keys as Vercel (required for S3 + Gemini)
GEMINI_API_KEY=...
AWS_S3_BUCKET=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=...
AWS_S3_ENDPOINT=...
AWS_S3_PREFIX=homesph
FFMPEG_PATH=/usr/bin/ffmpeg
```

### 3. Start with PM2

```bash
cd ~/HomesDrives
pm2 start ecosystem.config.cjs
# or restart only reels:
pm2 restart reels-api
pm2 save
```

### 4. Open EC2 security group

Allow inbound **TCP 8001** from `0.0.0.0/0` (or restrict to Vercel IPs if you prefer).

Test:

```bash
curl http://127.0.0.1:8001/health
```

## Vercel setup

In **Vercel → Settings → Environment Variables**:

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_REELS_API_URL` | `http://YOUR_EC2_PUBLIC_IP:8001` |
| `REELS_API_URL` | same as above (server-side fallback proxy) |
| `REELS_API_SECRET` | same secret as EC2 |
| `REELS_API_ALLOWED_ORIGINS` | not needed on Vercel |

Redeploy Vercel after adding env vars.

## Local development

Without EC2, reels runs in the Next.js app (no env vars needed):

```bash
npm run dev
```

To test against EC2 locally:

```
NEXT_PUBLIC_REELS_API_URL=http://YOUR_EC2_IP:8001
```

## Endpoints

| Method | Path |
|--------|------|
| GET | `/health` |
| GET/POST | `/api/reels-maker/jobs` |
| GET/DELETE | `/api/reels-maker/jobs/:jobId` |
| POST | `/api/reels-maker/jobs/:jobId/upload` |
| POST | `/api/reels-maker/jobs/:jobId/render` |
| GET | `/api/reels-maker/jobs/:jobId/video` |
| POST | `/api/reels-maker/youtube/preview` |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS error in browser | Add your Vercel URL to `REELS_API_ALLOWED_ORIGINS` on EC2, restart `reels-api` |
| 401 Unauthorized | Match `REELS_API_SECRET` on Vercel and EC2, or clear it on both |
| Upload fails | Browser must call EC2 directly — set `NEXT_PUBLIC_REELS_API_URL` |
| FFmpeg not found | `apt install ffmpeg`, set `FFMPEG_PATH=/usr/bin/ffmpeg` |

Job files are stored at `.data/reels-jobs/` on EC2.
