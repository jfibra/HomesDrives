# AI Reels Maker

YouTube music is downloaded in the **user's browser** (not on EC2), then uploaded as an audio file. This avoids YouTube blocking AWS datacenter IPs.

Optional: set `COBALT_API_KEY` in `.env` for a Cobalt tunnel fallback when Invidious/Piped fail.

Test stream resolution locally:

```bash
npx tsx scripts/test-youtube-browser-download.mjs "https://www.youtube.com/watch?v=VIDEO_ID"
```
