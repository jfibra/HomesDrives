# Homes.ph Reels API — Partner Integration Guide

Generate professional AI-edited property reels (short-form videos) through the Homes.ph Reels service. The API handles everything: AI story planning, **cinematic camera moves** (dolly / push / float — not a basic slideshow), purposeful transitions, color grading with film grain, editorial typography, voiceover narration, music mixing, branded end cards, and final MP4 export.

---

## Getting Started

1. Contact Homes.ph to get your **API key** and the **base URL** for the service.
2. Include the API key on every request: `x-api-key: rk_xxxxxxxxxx`
3. Follow the 5-step workflow below.

---

## Base URL

```
http://13.213.3.148:8001
```

Your integration contact will give you the exact host.

---

## Authentication

All `/api/reels-maker/*` endpoints require:

```
x-api-key: rk_your_key_here
```

Requests without a valid key get `401 Unauthorized`.

---

## Workflow Overview

```
1. POST   /api/reels-maker/jobs              → create job, receive jobId
2. POST   /api/reels-maker/jobs/:id/upload   → upload photos/videos
3. POST   /api/reels-maker/jobs/:id/render   → start AI + FFmpeg pipeline
4. GET    /api/reels-maker/jobs/:id          → poll until status = "completed"
5. GET    /api/reels-maker/jobs/:id/video    → download the final MP4
```

---

## Endpoints

### 1. Create a Job

```
POST /api/reels-maker/jobs
Content-Type: application/json
x-api-key: rk_xxx
```

**Body:**

```json
{
  "templateId": "social-trend",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "captionsEnabled": false,
  "reelBrief": "3-bedroom luxury condo in BGC with pool and city views, asking P18M",
  "outroEnabled": true,
  "outroLine": "Contact us for a private showing"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `templateId` | string | ✅ | Visual style — see [Templates](#templates) |
| `aspectRatio` | `"portrait"` \| `"landscape"` | No | `portrait` = 9:16 for Reels/TikTok (default). `landscape` = 16:9 for YouTube/Facebook. |
| `voiceOverEnabled` | boolean | No | Generate AI voiceover narration (audio only — no karaoke burn-in) |
| `captionsEnabled` | boolean | No | Prefer `false`. Karaoke subtitles are **never** burned into the video; bottom scene **titles** still appear. |
| `subtitlesEnabled` | boolean | No | Alias for `captionsEnabled`. |
| `reelBrief` | string | No | Property description for AI story generation |
| `outroEnabled` | boolean | No | Add spoken/branded outro. Default: `true` |
| `outroLine` | string | No | Custom call-to-action. For `listing-showcase`, shown as CTA text in the closing logo scene (defaults to "Scan to view listing"). |

**`listing-showcase` fields** — only used when `templateId` is `"listing-showcase"` (see [Listing Showcase](#listing-showcase-template)):

| Field | Type | Description |
|---|---|---|
| `listingPrice` | string | e.g. `"P18,000,000"`. Animates as a **count-up** price on every photo (eases to the final amount). Also accepts `₱12.5M` / `PHP 8.2M`. |
| `listingAddress` | string | Shown under the price on every photo, and used as the reel title. |
| `listingBeds` | string | e.g. `"3"` |
| `listingBaths` | string | e.g. `"2"` |
| `listingSqft` | string | e.g. `"120"` |
| `listingUrl` | string | Listing page URL — documentation only; upload the QR image via the `qr` upload field. |
| `agentName` | string | Shown on the agent contact card. |
| `agentPhone` | string | Shown on the agent contact card. |
| `agentEmail` | string | Shown on the agent contact card. |
| `agentAgencyName` | string | Shown on the agent contact card. |

**Response `201`:**

```json
{
  "id": "01HXYZ...",
  "status": "queued",
  "templateId": "real-estate",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "media": [],
  "createdAt": "2025-01-15T10:00:00.000Z"
}
```

Save the `id` — it is required for all subsequent requests.

---

### 2. Upload Media

#### Option A — Direct Upload (simple)

```
POST /api/reels-maker/jobs/:jobId/upload
Content-Type: multipart/form-data
x-api-key: rk_xxx
```

| Form field | Type | Notes |
|---|---|---|
| `files[]` | File | One or more images or videos. JPEG, PNG, HEIC, WEBP, MP4, MOV supported. Max 10 MB/photo, 100 MB/video. |
| `mediaNotes` | JSON string | `["living room", "pool area"]` — one note per file, same order. Optional but improves AI captions. |
| `music` | File (MP3) | Optional background music. Max 50 MB. |
| `logo` | File (PNG/JPG) | Optional logo. For most templates this renders as a watermark. For `listing-showcase` it instead appears full-size in the opening and closing logo scenes, plus small on the agent contact card. |
| `logoEnabled` | string | `"true"` to enable the logo overlay. |
| `logoPosition` | string | `"top-left"`, `"top-right"`, `"top-center"`, `"bottom-left"`, `"bottom-right"`, `"bottom-center"` — ignored by `listing-showcase`. |
| `logoDisplay` | string | `"always"` (default) or `"outro-only"` (last ~4 seconds only). Ignored by `listing-showcase`. |
| `qr` | File (PNG/JPG) | Optional QR code image (e.g. linking to the listing). For most templates it's rendered as a corner overlay inside a white box container. For `listing-showcase` it's rendered inside the agent contact card instead. |
| `qrEnabled` | string | `"true"` to enable rendering the QR code. |
| `qrPosition` | string | Same values as `logoPosition` — defaults to `"bottom-right"`. Ignored by `listing-showcase`. |
| `qrDisplay` | string | `"always"` (default) or `"outro-only"` (last ~4 seconds only). Use `"outro-only"` so QR/agent badge appears only at the end. Ignored by `listing-showcase`. |
| `agentHeadshot` | File (PNG/JPG) | `listing-showcase` only. Agent photo, shown circle-cropped on the contact card. |
| `agentHeadshotEnabled` | string | `"true"` to enable rendering the headshot. |

**Node.js example:**

```js
import fs from 'fs'
import FormData from 'form-data'
import fetch from 'node-fetch'

const form = new FormData()
form.append('files[]', fs.createReadStream('living-room.jpg'), 'living-room.jpg')
form.append('files[]', fs.createReadStream('pool.jpg'), 'pool.jpg')
form.append('mediaNotes', JSON.stringify(['Living room', 'Pool area']))

await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/upload`, {
  method: 'POST',
  headers: { 'x-api-key': API_KEY, ...form.getHeaders() },
  body: form,
})
```

**Response `200`:** `{ "ok": true, "mediaCount": 2 }`

---

#### Option B — Presigned Upload (large files / browser clients)

**Step 1 — request upload URLs:**

```
POST /api/reels-maker/jobs/:jobId/upload/presign
Content-Type: application/json
x-api-key: rk_xxx
```

```json
{
  "files": [
    {
      "clientId": "file-1",
      "fileName": "living-room.jpg",
      "contentType": "image/jpeg",
      "size": 3145728,
      "role": "media"
    },
    {
      "clientId": "bgmusic",
      "fileName": "music.mp3",
      "contentType": "audio/mpeg",
      "size": 5242880,
      "role": "music"
    }
  ]
}
```

`role`: `"media"`, `"music"`, `"logo"`, `"qr"`, or `"agentHeadshot"` (`listing-showcase` only).

**Response `200`:**

```json
{
  "uploads": [
    {
      "clientId": "file-1",
      "role": "media",
      "uploadUrl": "https://s3.amazonaws.com/...?X-Amz-Signature=...",
      "bucketName": "homes-ph-reels",
      "storagePath": "jobs/01HXYZ/media/abc.jpg",
      "contentType": "image/jpeg"
    }
  ]
}
```

**Step 2 — PUT each file directly to S3** (no API key needed — the URL is pre-signed):

```js
await fetch(upload.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': upload.contentType },
  body: fileBuffer,
})
```

**Step 3 — finalize:**

```
POST /api/reels-maker/jobs/:jobId/upload/finalize
Content-Type: application/json
x-api-key: rk_xxx
```

```json
{
  "uploads": [
    {
      "role": "media",
      "fileName": "living-room.jpg",
      "mimeType": "image/jpeg",
      "bucketName": "homes-ph-reels",
      "storagePath": "jobs/01HXYZ/media/abc.jpg",
      "userNote": "Living room"
    },
    {
      "role": "music",
      "fileName": "music.mp3",
      "mimeType": "audio/mpeg",
      "bucketName": "homes-ph-reels",
      "storagePath": "jobs/01HXYZ/music/xyz.mp3"
    }
  ]
}
```

**Response `200`:** `{ "ok": true }`

---

### 3. Start Rendering

```
POST /api/reels-maker/jobs/:jobId/render
Content-Type: application/json
x-api-key: rk_xxx
```

Optional body to override settings before rendering:

```json
{
  "reelBrief": "Updated property description",
  "voiceOverEnabled": true,
  "captionsEnabled": false,
  "templateId": "social-trend"
}
```

| Field | Notes |
|---|---|
| `captionsEnabled` / `subtitlesEnabled` | Prefer `false`. Voiceover still plays; short bottom **titles** still appear. Karaoke/narration subtitles are never burned into the MP4. |

**Response `200`:** `{ "ok": true }`

Rendering is **asynchronous**. It runs through these stages:

```
queued → analyzing → generating_story → writing_captions
       → creating_voiceover → rendering → uploading_result → completed
```

Typical time: **60–180 seconds**, depending on the number of photos and server load.

---

## On-video text (what partners get)

| Element | Behavior |
|---|---|
| **Bottom titles** | Short modern titles (1–4 words) in a lower-third: soft veil, slide-up fade, gold accent line. First scene may show a small Homes.ph label above the title. |
| **Karaoke / subtitles** | **Not burned in.** Voiceover is audio-only. Do not rely on bottom sentence captions. |
| **Listing price** | With `listing-showcase` + `listingPrice`, the price **counts up** (ease-out) then holds the final amount. Address / beds·baths·sqft appear under it. |
| **Social caption** | Job `caption` / hashtags are for posting copy in the API response — not burned into the video. |

---

### 4. Poll Job Status

```
GET /api/reels-maker/jobs/:jobId
x-api-key: rk_xxx
```

**Response `200`:**

```json
{
  "id": "01HXYZ...",
  "status": "rendering",
  "progress": 72,
  "message": "Rendering scene 4 of 6...",
  "templateId": "real-estate",
  "aspectRatio": "portrait",
  "plan": {
    "title": "BGC Dream Home",
    "scenes": [ ... ]
  },
  "resultUrl": null,
  "error": null,
  "updatedAt": "2025-01-15T10:01:30.000Z"
}
```

- When `status === "completed"` → `resultUrl` has the direct video URL.
- When `status === "failed"` → `error` has a description.

**Recommended polling interval:** every **5 seconds**.

---

### 5. Download the Video

```
GET /api/reels-maker/jobs/:jobId/video
x-api-key: rk_xxx
```

Streams the final MP4. Supports HTTP Range requests for resumable downloads.

```
Content-Type: video/mp4
Content-Length: 24576000
Accept-Ranges: bytes
```

**Node.js download example:**

```js
import fs from 'fs'
import fetch from 'node-fetch'

const res = await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/video`, {
  headers: { 'x-api-key': API_KEY },
})
res.body.pipe(fs.createWriteStream('output.mp4'))
```

---

### 6. Other Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reels-maker/jobs` | List all jobs |
| `DELETE` | `/api/reels-maker/jobs/:id` | Delete a job and its files |
| `POST` | `/api/reels-maker/youtube/preview` | Get YouTube track metadata |

**YouTube track preview:**

```
POST /api/reels-maker/youtube/preview
Content-Type: application/json
x-api-key: rk_xxx
```

```json
{ "url": "https://www.youtube.com/watch?v=..." }
```

Response: `{ "preview": { "title": "...", "duration": 240, "thumbnail": "..." } }`

---

## Job Status Reference

| Status | Description |
|---|---|
| `queued` | Created, waiting to start |
| `uploading` | Media is being attached |
| `analyzing` | AI analyzing uploaded photos/videos |
| `generating_story` | AI writing scene narrative |
| `writing_captions` | Captions being finalized |
| `creating_voiceover` | Text-to-speech audio generating |
| `rendering` | FFmpeg rendering scenes |
| `uploading_result` | Video being saved to storage |
| `completed` | Done — `resultUrl` is set |
| `failed` | Error — check `error` field |

---

## Templates

| `templateId` | Look & Feel |
|---|---|
| `real-estate` | Bright, warm, professional property showcase |
| `cinematic` | Filmic tones, desaturated, wide-format feel |
| `luxury` | Deep contrast, warm gold tones |
| `modern` | Clean, high-contrast, sharp |
| `minimal` | Soft, desaturated, editorial |
| `travel` | Vivid saturation, adventurous energy |
| `family` | Warm, soft, inviting |
| `event` | High energy, punchy contrast |
| `birthday` | Colorful, celebratory |
| `wedding` | Soft romantic, pastel tones |
| `social-trend` | Ultra-saturated, viral style |
| `listing-showcase` | Structured listing tour — see below |

### Listing Showcase Template

`listing-showcase` builds a fixed structure instead of an AI-improvised story, so price and address are always exact:

1. **Logo intro** — your `logo` fades in, scales up, with a soft glow, holds ~2s, then dissolves into the photo tour.
2. **Photo tour** — cinematic camera moves (dolly, corner push, float, drift — not basic Ken Burns). Bottom lower-third shows `listingPrice` as a **count-up**, then address + **beds / baths / sqft chips**.
3. **Agent contact card** — `agentHeadshot` (circle-cropped), `qr` (in a white box), and `agentName` / `agentPhone` / `agentEmail` / `agentAgencyName`, laid out like a business card. Only rendered if at least one of these is provided.
4. **Logo outro** — your `logo` again, with `outroLine` (or "Scan to view listing" by default) as the call-to-action, fading to black.

Because the logo and QR are embedded directly into these scenes, they are **not** also applied as a persistent corner watermark for this template — `logoPosition` / `qrPosition` / `logoDisplay` / `qrDisplay` are ignored.

---

## Cinematic edit quality (Phase 1)

The server now treats every reel as a **luxury motion edit**, not a slideshow:

| Area | Behavior |
|---|---|
| **Camera** | Dolly-in/out, corner push, vertical drift, horizontal track, float — never repeats the same move twice in a row |
| **Timing** | Scene roles: hook (~2s) → hero (3–4s) → detail (1.6–2.4s) → closing (~3s). Not identical holds. |
| **Story order** | Strongest / highest-quality shot opens (hook first) |
| **Transitions** | Purposeful xfade set: radial, flash-white, smooth pans, diag wipe, circle-open, wind, etc. |
| **Grade** | Stronger template looks + subtle film grain |
| **Type** | Editorial lower-third (Plus Jakarta / Manrope), accent line, no karaoke burn-in |
| **End card** | When `outroEnabled`, a dedicated branded CTA scene (logo reveal + optional QR + `outroLine`) |

**Phase 2 (roadmap):** AI depth/parallax, Remotion-grade motion graphics, true BPM beat sync, 60fps GPU encode.

Partners do **not** need to send motion/transition fields — the server chooses cinematic moves. Optional `reelBrief` still improves storytelling.

---

## Homes.ph branding layout (recommended)

Goal: Homes.ph logo **top-center** for the full reel · agent/QR **only at the end** · modern bottom titles · voiceover **without** karaoke subtitles.

**Create:**

```json
{
  "templateId": "social-trend",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "captionsEnabled": false,
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "reelBrief": "…"
}
```

For a **counting price** on every photo, use `listing-showcase` instead and set `listingPrice` (e.g. `"P18,000,000"`).

**Upload (multipart):**

| Field | Value |
|---|---|
| `logo` | Homes.ph mark only (not a full agent composite) |
| `logoEnabled` | `"true"` |
| `logoPosition` | `"top-center"` |
| `logoDisplay` | `"always"` |
| `qr` | Listing QR and/or agent end-card image |
| `qrEnabled` | `"true"` |
| `qrPosition` | `"bottom-center"` (or a corner) |
| `qrDisplay` | `"outro-only"` |

This keeps the logo for the whole reel and shows the QR/end badge only on the last ~4 seconds — no need to append a fake end-card photo as the last media file.

### What partners can use now (quick reference)

| Capability | How |
|---|---|
| Logo top-center full video | `logoPosition=top-center` + `logoDisplay=always` |
| Logo bottom-center (also supported) | `logoPosition=bottom-center` |
| QR / end badge only at end | `qrDisplay=outro-only` (~last 4 seconds) |
| Logo only at end | `logoDisplay=outro-only` |
| No karaoke subtitles | Default behavior; set `captionsEnabled: false` on create/render |
| Modern bottom titles | Automatic on all non-listing templates |
| Price count-up | `templateId: "listing-showcase"` + `listingPrice` |
| Spoken / visual CTA | `outroEnabled` + `outroLine` (dedicated end-card scene) |
| Cinematic motion / transitions | Automatic (server-side Phase 1 editor) |

---

## Error Responses

All errors return JSON:

```json
{ "error": "Job not found" }
```

| HTTP Status | Meaning |
|---|---|
| `400` | Bad request — missing or invalid field |
| `401` | Invalid or missing `x-api-key` |
| `404` | Job not found |
| `500` | Server error — check `error` field |

---

## Full Integration Example (Node.js)

```js
import fs from 'fs'
import fetch from 'node-fetch'
import FormData from 'form-data'

const BASE_URL = 'http://<provided-host>:8001'
const API_KEY  = 'rk_your_key_here'
const headers  = { 'x-api-key': API_KEY }

// ── 1. Create job ──────────────────────────────────────────────────────────────
const job = await fetch(`${BASE_URL}/api/reels-maker/jobs`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    templateId: 'real-estate',
    aspectRatio: 'portrait',
    voiceOverEnabled: true,
    reelBrief: '3BR luxury condo in BGC with pool and city views, asking P18M',
    outroLine: 'Contact us for a private showing',
  }),
}).then(r => r.json())

const jobId = job.id
console.log('Job created:', jobId)

// ── 2. Upload photos ───────────────────────────────────────────────────────────
const form = new FormData()
form.append('files[]', fs.createReadStream('photo1.jpg'), 'photo1.jpg')
form.append('files[]', fs.createReadStream('photo2.jpg'), 'photo2.jpg')
form.append('files[]', fs.createReadStream('photo3.jpg'), 'photo3.jpg')
form.append('mediaNotes', JSON.stringify(['Living room', 'Master bedroom', 'Pool']))

await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/upload`, {
  method: 'POST',
  headers: { ...headers, ...form.getHeaders() },
  body: form,
})
console.log('Media uploaded')

// ── 3. Start rendering ─────────────────────────────────────────────────────────
await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/render`, {
  method: 'POST',
  headers,
})
console.log('Rendering started')

// ── 4. Poll until done ─────────────────────────────────────────────────────────
let status = 'queued'
while (!['completed', 'failed'].includes(status)) {
  await new Promise(r => setTimeout(r, 5000)) // wait 5s
  const data = await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}`, { headers }).then(r => r.json())
  status = data.status
  console.log(`[${data.progress}%] ${data.message}`)

  if (status === 'completed') {
    console.log('Video ready at:', data.resultUrl)
  }
  if (status === 'failed') {
    console.error('Render failed:', data.error)
    process.exit(1)
  }
}

// ── 5. Download the MP4 ────────────────────────────────────────────────────────
const res = await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/video`, { headers })
res.body.pipe(fs.createWriteStream('output.mp4'))
console.log('Saved to output.mp4')
```

**Listing Showcase example** (steps 4–5 — polling/download — are identical to above):

```js
// ── 1. Create job with listing + agent details ─────────────────────────────────
const job = await fetch(`${BASE_URL}/api/reels-maker/jobs`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    templateId: 'listing-showcase',
    aspectRatio: 'portrait',
    outroLine: 'Contact us today',
    listingPrice: 'P18,000,000',
    listingAddress: 'BGC, Taguig City',
    listingBeds: '3',
    listingBaths: '2',
    listingSqft: '120',
    listingUrl: 'https://homes.ph/listings/bgc-condo-123',
    agentName: 'Maria Santos',
    agentPhone: '+63 917 000 0000',
    agentEmail: 'maria@agency.ph',
    agentAgencyName: 'Homes.ph Realty',
  }),
}).then(r => r.json())

const jobId = job.id

// ── 2. Upload photos, logo, QR, and agent headshot ──────────────────────────────
const form = new FormData()
form.append('files[]', fs.createReadStream('living-room.jpg'), 'living-room.jpg')
form.append('files[]', fs.createReadStream('pool.jpg'), 'pool.jpg')
form.append('logo', fs.createReadStream('agency-logo.png'), 'agency-logo.png')
form.append('logoEnabled', 'true')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('agentHeadshot', fs.createReadStream('agent-photo.jpg'), 'agent-photo.jpg')
form.append('agentHeadshotEnabled', 'true')

await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/upload`, {
  method: 'POST',
  headers: { ...headers, ...form.getHeaders() },
  body: form,
})

// ── 3. Start rendering ─────────────────────────────────────────────────────────
await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/render`, { method: 'POST', headers })
```

---

## Notes

- **Supported formats:** JPEG, PNG, HEIC, WEBP, AVIF (photos); MP4, MOV, M4V (videos).
- **Minimum media:** At least 1 image or video required.
- **Render time:** 60–180 seconds depending on scene count and server load.
- **Output spec:** H.264 MP4, 1080×1920 @ 30fps (portrait) or 1920×1080 (landscape), CRF 17.
- **Job storage:** Jobs persist indefinitely. Clean up unused jobs with `DELETE /jobs/:id`.
- **API keys** are per-partner and can be revoked without affecting other integrations.

---

*For API key issuance or support, contact your Homes.ph integration contact.*
