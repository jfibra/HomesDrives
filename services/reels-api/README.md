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
YT_DLP_PATH=/usr/local/bin/yt-dlp
YT_DLP_JS_RUNTIMES=deno:/root/.deno/bin/deno
YT_DLP_REMOTE_COMPONENTS=ejs:github
# PO Token provider — prevents 403 on audio streams (NOT the bot-check wall)
# bash scripts/setup-yt-dlp-pot-ec2.sh
YT_DLP_POT_ENABLED=1
YT_DLP_POT_BASE_URL=http://127.0.0.1:4416
# Fresh youtube.com cookies required on AWS to pass bot check:
YT_DLP_COOKIES_FILE=/root/HomesDrives/.data/youtube-cookies.txt
# Optional residential proxy if cookies alone fail:
# YT_DLP_PROXY=socks5h://user:pass@host:port
```

### 2b. Install Deno + PO Token provider (required for YouTube links)

yt-dlp needs **Deno** (recommended) or **Node 22+** to solve YouTube JS challenges. Node 20 is not enough.

EC2 datacenter IPs are often flagged by YouTube. Use the **bgutil PO Token provider** (no browser cookies needed):

```bash
curl -fsSL https://deno.land/install.sh | sh
/root/.deno/bin/deno --version

cd ~/HomesDrives
git pull
bash scripts/setup-yt-dlp-pot-ec2.sh
```

Add to `.env`:

```
YT_DLP_POT_ENABLED=1
YT_DLP_POT_BASE_URL=http://127.0.0.1:4416
YT_DLP_COOKIES_FILE=/root/HomesDrives/.data/youtube-cookies.txt
```

**POT alone does not bypass the bot check.** AWS datacenter IPs need **fresh YouTube login cookies** (or a residential proxy).

### 2c. Export and upload YouTube cookies

1. Open **Chrome incognito** → go to [youtube.com](https://www.youtube.com) and sign in (use a secondary Google account if you prefer).
2. In the **same tab**, visit `https://www.youtube.com/robots.txt`
3. Install [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) → export **youtube.com only**.
4. Upload to EC2 (pick one):

```bash
# Option A: curl from your PC (replace SECRET and path)
curl -X PUT "http://YOUR_EC2_IP:8001/api/reels-maker/youtube/cookies" \
  -H "x-reels-api-secret: YOUR_REELS_API_SECRET" \
  -H "Content-Type: text/plain" \
  --data-binary @cookies.txt

# Option B: scp then on EC2
mkdir -p ~/HomesDrives/.data
# scp cookies.txt root@EC2:~/HomesDrives/.data/youtube-cookies.txt
chmod 600 ~/HomesDrives/.data/youtube-cookies.txt
```

5. **Remove** `YT_DLP_SKIP_COOKIES=1` from `.env` if present.
6. Close the incognito window immediately after export.

Restart workers:

```bash
pm2 restart reels-api bgutil-pot --update-env
bash scripts/validate-yt-dlp-ec2.sh
```

Test a download (with cookies — uses progressive https + ffmpeg extract):

```bash
/usr/local/bin/yt-dlp \
  --js-runtimes deno:/root/.deno/bin/deno \
  --cookies /root/HomesDrives/.data/youtube-cookies.txt \
  -f 'best[protocol=https]' \
  --extract-audio --audio-format m4a \
  -o '/tmp/test.%(ext)s' \
  'https://www.youtube.com/watch?v=WerQABDxisM'
ls -la /tmp/test*
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
| `spawn yt-dlp ENOENT` | Run `node node_modules/youtube-dl-exec/scripts/postinstall.js`, set `YT_DLP_PATH` in `.env`, `pm2 restart reels-api --update-env` |
| YouTube "Sign in / not a bot" | Export fresh youtube.com cookies (see 2c). POT does not fix this. Remove `YT_DLP_SKIP_COOKIES=1`. |
| YouTube "cookies are no longer valid" | Re-export cookies. Do not export all sites — youtube.com only. |
| Cookies work locally but not on EC2 | Set `YT_DLP_PROXY` to a residential proxy in `.env` |
| yt-dlp 403 on format 18 / empty HLS file | Automatic **Piped API** fallback. Test: `curl -s https://api.piped.private.coffee/streams/VIDEO_ID \| python3 -m json.tool \| head` |

Job files are stored at `.data/reels-jobs/` on EC2.
