# AI Reels Maker — EC2 deployment

Reels Maker needs **FFmpeg**, **yt-dlp**, **long-running video jobs**, and **writable disk** for `.data/reels-jobs/`. Vercel serverless cannot do that reliably.

Run the **full HomesDrives Next.js app** on the same EC2 box as `insightface-api`.

---

## Architecture

```
                    ┌─────────────────────────────────────┐
  Browser  ───────► │  EC2 (Ubuntu)                       │
                    │                                     │
                    │  nginx :443  ──► Next.js :3000      │
                    │                    │                │
                    │                    ├─ /reels-maker │
                    │                    └─ /api/reels-*  │
                    │                                     │
                    │  InsightFace API :8000 (optional)   │
                    └─────────────────────────────────────┘
                              │
                              ▼
                         S3 / Supabase storage
```

---

## 1. First-time EC2 setup (Ubuntu console)

SSH into your instance, then run these **once**.

### System packages

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y git curl build-essential ffmpeg python3 python3-venv python3-pip
```

`ffmpeg` is required for video rendering. `youtube-dl-exec` (npm) bundles `yt-dlp` for YouTube music.

### Node.js 20 + pnpm + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pnpm pm2
node -v    # should be v20.x
pnpm -v
```

### Clone the repo (first time only)

```bash
cd ~
git clone https://github.com/YOUR_ORG/HomesDrives.git
cd HomesDrives
```

Use your real Git remote URL. If the repo is private, set up an SSH key or deploy token on EC2 first.

### Environment file

```bash
cp .env.sample .env
nano .env
```

Fill in at least:

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` | Story + voice script |
| `AWS_S3_BUCKET` | Upload photos, music, rendered MP4 |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 credentials |
| `AWS_REGION` | e.g. `ap-southeast-1` |
| `AWS_S3_ENDPOINT` | Supabase S3 endpoint if using Supabase storage |
| `AWS_S3_PREFIX` | e.g. `homesph` |
| `NEXT_PUBLIC_SUPABASE_URL` / keys | If app uses Supabase |
| `INSIGHTFACE_API_URL` | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_APP_URL` | Public URL, e.g. `https://drive.homes.ph` |

### InsightFace API (Python)

```bash
cd ~/HomesDrives/services/insightface-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate
cd ~/HomesDrives
```

### Install app + build

```bash
cd ~/HomesDrives
pnpm install
pnpm build
```

First `pnpm install` downloads `ffmpeg-static` and `yt-dlp` binaries via npm postinstall scripts.

### Start with PM2

From the **repo root**:

```bash
cd ~/HomesDrives
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Follow the command `pm2 startup` prints (copy/paste the `sudo env ...` line), then run `pm2 save` again.

Check:

```bash
pm2 status
curl -s http://127.0.0.1:3000 | head
curl -s http://127.0.0.1:8000/health
```

Open `http://YOUR_EC2_PUBLIC_IP:3000/reels-maker` in the browser (or your domain after nginx).

---

## 2. Every deploy (git pull workflow)

After you push changes from your PC:

```bash
cd ~/HomesDrives
git pull
pnpm install
pnpm build
pm2 restart ecosystem.config.cjs
```

Or restart only the web app:

```bash
pm2 restart homesdrives
```

View logs:

```bash
pm2 logs homesdrives
pm2 logs insightface-api
```

---

## 3. nginx + HTTPS (recommended)

Expose port 443 instead of `:3000` publicly.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/homesdrives
```

Example server block:

```nginx
server {
    listen 80;
    server_name drive.homes.ph;

    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
    }
}
```

Enable and get SSL:

```bash
sudo ln -s /etc/nginx/sites-available/homesdrives /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d drive.homes.ph
```

`client_max_body_size` and long `proxy_read_timeout` help large photo uploads and slow reel renders.

---

## 4. EC2 security group

| Port | Source | Use |
|------|--------|-----|
| 22 | Your IP | SSH |
| 80, 443 | 0.0.0.0/0 | Web (nginx) |
| 3000, 8000 | — | Keep **closed** publicly; only localhost |

---

## 5. Vercel + EC2 together

If the main site stays on Vercel but reels must work:

1. **Easiest:** Point your production domain to EC2 (run the full app there). Use Vercel only for previews.
2. **Split domain:** e.g. `drive.homes.ph` → EC2, `www` → Vercel.
3. **Not recommended without extra work:** UI on Vercel calling reels APIs on Vercel — generation will fail (no FFmpeg, no disk, timeout).

Job state is stored on disk at `.data/reels-jobs/` on whichever server handles `/api/reels-maker`. All reels traffic must hit **the same EC2 instance**.

---

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| `FFmpeg binary not found` | `sudo apt install ffmpeg` or set `FFMPEG_PATH=/usr/bin/ffmpeg` in `.env` |
| YouTube music fails | Ensure `pnpm install` ran (yt-dlp binary). Check `pm2 logs homesdrives` |
| Upload too large | Increase nginx `client_max_body_size` |
| Job stuck / 504 | Increase nginx `proxy_read_timeout`; reel renders can take several minutes |
| Drafts missing after redeploy | `.data/reels-jobs/` is on EC2 disk — survives `pm2 restart`, not `rm -rf` |
| People/faces not working | `pm2 restart insightface-api`, check `INSIGHTFACE_API_URL` |

---

## 7. What is *not* in this folder

Reels logic is in the main app:

- UI: `app/reels-maker/`
- API: `app/api/reels-maker/`
- Pipeline: `lib/reels-maker/`

This `services/reels-maker/` folder is the **deployment guide** only, matching how `services/insightface-api/` documents the vision service.
