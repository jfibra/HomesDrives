# Homes.ph Reels API — Partner Integration Guide

Generate professional AI-edited property reels (short-form videos) through the Homes.ph Reels service. The API handles everything: AI story planning, **cinematic camera moves** (dolly / push / float — not a basic slideshow), purposeful transitions, color grading with film grain, editorial typography, voiceover narration, music mixing, branded end cards, and final MP4 export.

---

## What’s new (for API partners)

You do **not** need a new client protocol for cinematic quality. Use the same 5-step workflow. The server now edits like a luxury motion designer.

| You control | Automatic (server) |
|---|---|
| Photos, music, logo, QR | Camera moves (dolly, corner push, float, drift…) |
| `templateId`, `reelBrief` | Non-uniform scene timing (hook → hero → detail → closing) |
| `logoPosition` / `logoDisplay` | Strongest shot first |
| `qrPosition` / `qrDisplay` | Cinematic transitions (radial, flash-white, smooth pans…) |
| `captionsEnabled: false` | Film grain + stronger grade |
| `outroEnabled` + `outroLine` | Editorial bottom titles + branded **end-card** scene |
| Listing fields (price, beds…) | Price **count-up** + feature chips (`listing-showcase`) |

**Important for client apps:**

1. **Do not burn your own karaoke captions** — bottom sentence subtitles are never burned in. Short titles still appear.
2. **Do not append a fake “end card” photo** as the last media file — use `qrDisplay: "outro-only"` (and/or `logoDisplay: "outro-only"`) plus `outroEnabled` + `outroLine`.
3. **Do not send motion/transition enums** — the server chooses them. A good `reelBrief` still improves story and VO.
4. **Recommended branding create body** always includes `"captionsEnabled": false` and `"outroEnabled": true`.

See [Cinematic edit quality (Phase 1)](#cinematic-edit-quality-phase-1) and [Homes.ph branding layout](#homesp-branding-layout-recommended).

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
2. POST   /api/reels-maker/jobs/:id/upload   → upload photos/videos (+ logo / QR)
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

**Body (recommended Homes.ph style):**

```json
{
  "templateId": "social-trend",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "captionsEnabled": false,
  "reelBrief": "3-bedroom luxury condo in BGC with pool and city views, asking P18M",
  "outroEnabled": true,
  "outroLine": "Scan for listing details"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `templateId` | string | ✅ | Visual style — see [Templates](#templates). Prefer `social-trend`, `luxury`, or `listing-showcase`. |
| `aspectRatio` | `"portrait"` \| `"landscape"` | No | `portrait` = 9:16 for Reels/TikTok (default). `landscape` = 16:9 for YouTube/Facebook. |
| `voiceOverEnabled` | boolean | No | Generate AI voiceover narration (**audio only** — no karaoke burn-in) |
| `captionsEnabled` | boolean | No | Prefer `false`. Karaoke subtitles are **never** burned into the video; bottom scene **titles** still appear. |
| `subtitlesEnabled` | boolean | No | Alias for `captionsEnabled`. |
| `reelBrief` | string | No | Property description — improves AI story, scene order, and voiceover |
| `outroEnabled` | boolean | No | Default `true`. Adds spoken CTA (if VO on) **and** a branded visual **end-card** scene (logo reveal + optional QR + `outroLine`). |
| `outroLine` | string | No | Call-to-action text on the end card / listing outro (e.g. `"Scan for listing details"`). |

**`listing-showcase` fields** — only used when `templateId` is `"listing-showcase"` (see [Listing Showcase](#listing-showcase-template)):

| Field | Type | Description |
|---|---|---|
| `listingPrice` | string | e.g. `"P18,000,000"`. **Count-up** price animation on every photo. Also accepts `₱12.5M` / `PHP 8.2M`. |
| `listingAddress` | string | Shown under the price; also used as the reel title. |
| `listingBeds` | string | e.g. `"3"` — shown as a feature chip |
| `listingBaths` | string | e.g. `"2"` — shown as a feature chip |
| `listingSqft` | string | e.g. `"120"` — shown as a feature chip |
| `listingUrl` | string | Listing page URL — documentation only; upload the QR image via the `qr` upload field. |
| `agentName` | string | Shown on the agent contact card. |
| `agentPhone` | string | Shown on the agent contact card. |
| `agentEmail` | string | Shown on the agent contact card. |
| `agentAgencyName` | string | Shown on the agent contact card. |

**Response `201`:**

```json
{
  "job": {
    "id": "01HXYZ...",
    "status": "queued",
    "templateId": "social-trend",
    "aspectRatio": "portrait",
    "voiceOverEnabled": true,
    "captionsEnabled": false,
    "media": [],
    "createdAt": "2025-01-15T10:00:00.000Z"
  }
}
```

Save `job.id` — it is required for all subsequent requests. (Some clients may also see `id` flattened; prefer `job.id`.)

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
| `files` / `files[]` | File | One or more images or videos. JPEG, PNG, HEIC, WEBP, MP4, MOV supported. Max 10 MB/photo, 100 MB/video. |
| `mediaNotes` | JSON string | `["living room", "pool area"]` — one note per file, same order. Optional; helps storytelling. |
| `music` | File (MP3) | Optional background music. Max 50 MB. |
| `logo` | File (PNG/JPG) | Brand mark. Corner/center watermark **or** end-card (see `logoDisplay`). For `listing-showcase`: intro + outro + small on agent card. |
| `logoEnabled` | string | `"true"` to enable. |
| `logoPosition` | string | `"top-left"`, `"top-right"`, `"top-center"`, `"bottom-left"`, `"bottom-right"`, `"bottom-center"`. Use **`top-center`** for Homes.ph. Ignored by `listing-showcase`. |
| `logoDisplay` | string | `"always"` (default, full reel) or `"outro-only"` (end window / end card). Ignored by `listing-showcase`. |
| `qr` | File (PNG/JPG) | Listing QR or agent end-card composite. White-boxed watermark **or** end-card only. For `listing-showcase`: agent contact card. |
| `qrEnabled` | string | `"true"` to enable. |
| `qrPosition` | string | Same values as `logoPosition` — defaults to `"bottom-right"`. Ignored by `listing-showcase`. |
| `qrDisplay` | string | `"always"` or **`"outro-only"`** (recommended for agent/QR so it does not cover property shots). Ignored by `listing-showcase`. |
| `agentHeadshot` | File (PNG/JPG) | `listing-showcase` only. Agent photo, circle-cropped on the contact card. |
| `agentHeadshotEnabled` | string | `"true"` to enable. |

**Homes.ph branding upload (copy-paste):**

```js
form.append('logo', fs.createReadStream('homes-logo.png'), 'homes-logo.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')
form.append('logoDisplay', 'always')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrPosition', 'bottom-center')
form.append('qrDisplay', 'outro-only')
```

**Node.js example:**

```js
import fs from 'fs'
import FormData from 'form-data'
import fetch from 'node-fetch'

const form = new FormData()
form.append('files', fs.createReadStream('living-room.jpg'), 'living-room.jpg')
form.append('files', fs.createReadStream('pool.jpg'), 'pool.jpg')
form.append('mediaNotes', JSON.stringify(['Living room', 'Pool area']))
form.append('logo', fs.createReadStream('homes-logo.png'), 'homes-logo.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')
form.append('logoDisplay', 'always')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrPosition', 'bottom-center')
form.append('qrDisplay', 'outro-only')

await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/upload`, {
  method: 'POST',
  headers: { 'x-api-key': API_KEY, ...form.getHeaders() },
  body: form,
})
```

**Response `200`:** `{ "job": { ... }, "uploadedMedia": [ ... ] }`

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
      "clientId": "logo",
      "fileName": "homes-logo.png",
      "contentType": "image/png",
      "size": 120000,
      "role": "logo"
    },
    {
      "clientId": "qr",
      "fileName": "listing-qr.png",
      "contentType": "image/png",
      "size": 80000,
      "role": "qr"
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

**Step 3 — finalize** (include logo/QR display flags):

```
POST /api/reels-maker/jobs/:jobId/upload/finalize
Content-Type: application/json
x-api-key: rk_xxx
```

```json
{
  "logoEnabled": true,
  "logoPosition": "top-center",
  "logoDisplay": "always",
  "qrEnabled": true,
  "qrPosition": "bottom-center",
  "qrDisplay": "outro-only",
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
      "role": "logo",
      "fileName": "homes-logo.png",
      "mimeType": "image/png",
      "bucketName": "homes-ph-reels",
      "storagePath": "jobs/01HXYZ/logo/xyz.png"
    },
    {
      "role": "qr",
      "fileName": "listing-qr.png",
      "mimeType": "image/png",
      "bucketName": "homes-ph-reels",
      "storagePath": "jobs/01HXYZ/qr/qr.png"
    }
  ]
}
```

**Response `200`:** `{ "job": { ... }, "uploadedMedia": [ ... ] }`

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
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "templateId": "social-trend"
}
```

| Field | Notes |
|---|---|
| `captionsEnabled` / `subtitlesEnabled` | Prefer `false`. Voiceover still plays; short bottom **titles** still appear. Karaoke subtitles are never burned into the MP4. |
| `outroEnabled` / `outroLine` | Controls spoken CTA + visual end-card. |

**Response `200`:** `{ "jobId": "...", "started": true }`

Rendering is **asynchronous**. It runs through these stages:

```
queued → analyzing → generating_story → writing_captions
       → creating_voiceover → rendering → uploading_result → completed
```

Typical time: **60–180 seconds**, depending on the number of photos and server load.

---

## What appears in the finished video

| Element | Behavior |
|---|---|
| **Cinematic photo motion** | Dolly / push / track / float (server-chosen). Not a basic slideshow. |
| **Bottom titles** | Slanted broadcast lower-third (logo tab + white title ribbon + blue subtitle), **slides in left → right** |
| **Karaoke / subtitles** | **Never burned in.** Voiceover is audio-only. |
| **Logo watermark** | Position + `always` / `outro-only` (non–listing-showcase). |
| **QR / end badge** | Prefer `outro-only` so it appears on the branded end card / last seconds only. |
| **End card** | When `outroEnabled`: logo reveal + optional QR + `outroLine` (~3s). |
| **Listing price** | `listing-showcase` + `listingPrice` → **count-up** on a blue veil + gold edge, then address + beds/baths/sqft **chips**. |
| **Social caption** | Job `caption` / hashtags in the API response are for posting copy — not burned into the video. |

---

### 4. Poll Job Status

```
GET /api/reels-maker/jobs/:jobId
x-api-key: rk_xxx
```

**Response `200`:**

```json
{
  "job": {
    "id": "01HXYZ...",
    "status": "rendering",
    "progress": 72,
    "message": "Rendering video…",
    "templateId": "social-trend",
    "aspectRatio": "portrait",
    "plan": {
      "title": "BGC Dream Home",
      "scenes": [ "... server-planned cinematic scenes ..." ]
    },
    "resultUrl": null,
    "error": null,
    "updatedAt": "2025-01-15T10:01:30.000Z"
  }
}
```

- When `job.status === "completed"` → prefer downloading via `/video`.
- When `job.status === "failed"` → `job.error` has a description.

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
| `generating_story` | AI writing cinematic scene plan |
| `writing_captions` | Timeline / titles finalized |
| `creating_voiceover` | Text-to-speech audio generating |
| `rendering` | FFmpeg rendering scenes |
| `uploading_result` | Video being saved to storage |
| `completed` | Done — video ready |
| `failed` | Error — check `error` field |

---

## Templates

| `templateId` | Look & Feel |
|---|---|
| `real-estate` | Bright, warm, professional property showcase |
| `cinematic` | Filmic tones, desaturated, wide-format feel |
| `luxury` | Deep contrast, warm gold tones — great for premium listings |
| `modern` | Clean, high-contrast, sharp |
| `minimal` | Soft, desaturated, editorial |
| `travel` | Vivid saturation, adventurous energy |
| `family` | Warm, soft, inviting |
| `event` | High energy, punchy contrast |
| `birthday` | Colorful, celebratory |
| `wedding` | Soft romantic, pastel tones |
| `social-trend` | Ultra-saturated, viral style — default for Homes.ph social |
| `listing-showcase` | Structured listing tour — see below |

### Listing Showcase Template

`listing-showcase` builds a fixed structure instead of an AI-improvised story, so price and address are always exact:

1. **Logo intro** — your `logo` fades in, scales up, with a soft glow, holds ~2s, then dissolves into the photo tour.
2. **Photo tour** — cinematic camera moves (dolly, corner push, float, drift). Bottom lower-third shows `listingPrice` as a **count-up**, then address + **beds / baths / sqft chips**.
3. **Agent contact card** — `agentHeadshot` (circle-cropped), `qr` (in a white box), and `agentName` / `agentPhone` / `agentEmail` / `agentAgencyName`. Only rendered if at least one of these is provided.
4. **Logo outro** — your `logo` again, with `outroLine` (or "Scan to view listing" by default).

Because the logo and QR are embedded directly into these scenes, they are **not** also applied as a persistent corner watermark for this template — `logoPosition` / `qrPosition` / `logoDisplay` / `qrDisplay` are ignored.

---

## Cinematic edit quality (Phase 1)

The server treats every reel as a **luxury motion edit**, not a slideshow:

| Area | Behavior |
|---|---|
| **Camera** | Dolly-in/out, corner push, vertical drift, horizontal track, float — avoids repeating the same move |
| **Timing** | Every photo holds **exactly 2.0s**. Short fades so the hold isn’t eaten by long crossfades. |
| **Story order** | Strongest / highest-quality shot opens (hook first) |
| **Transitions** | Short fades / slide L-R / wipe-up (≈0.2s) — no long circular wipes |
| **Grade** | Stronger template looks + subtle film grain |
| **Type** | Straight pans L↔R / T↔B + slanted lower-third (logo / title / subtitle) |
| **End card** | When `outroEnabled`: dedicated branded CTA (logo reveal + optional QR + `outroLine`) |

**Phase 2 (roadmap, not available yet):** AI depth/parallax, Remotion-grade motion graphics, true BPM beat sync, 60fps GPU encode.

Partners do **not** send motion/transition fields — the server chooses cinematic moves. Optional `reelBrief` still improves storytelling.

---

## Homes.ph branding layout (recommended)

Goal: Homes.ph logo **top-center** for the full reel · agent/QR **only at the end** · modern bottom titles · voiceover **without** karaoke subtitles · cinematic motion.

**Create:**

```json
{
  "templateId": "social-trend",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "captionsEnabled": false,
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "reelBrief": "3BR luxury condo in BGC with pool and city views, asking P18M"
}
```

For a **counting price** on every photo, use `templateId: "listing-showcase"` and set `listingPrice` (e.g. `"P18,000,000"`).

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

This keeps the logo for the whole reel and shows the QR/end badge on the branded end card — no need to append a fake end-card photo as the last media file.

### Quick reference — what partners can use

| Capability | How |
|---|---|
| Logo top-center full video | `logoPosition=top-center` + `logoDisplay=always` |
| Logo bottom-center | `logoPosition=bottom-center` |
| QR / end badge only at end | `qrDisplay=outro-only` |
| Logo only at end | `logoDisplay=outro-only` |
| No karaoke subtitles | `captionsEnabled: false` (karaoke never burned in either way) |
| Modern bottom titles | Automatic |
| Price count-up + chips | `templateId: "listing-showcase"` + `listingPrice` / beds / baths / sqft |
| Spoken + visual CTA | `outroEnabled: true` + `outroLine` |
| Cinematic motion / transitions | Automatic — no client fields required |

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
| `409` | Job already processing or completed |
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
const created = await fetch(`${BASE_URL}/api/reels-maker/jobs`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    templateId: 'social-trend',
    aspectRatio: 'portrait',
    voiceOverEnabled: true,
    captionsEnabled: false,
    reelBrief: '3BR luxury condo in BGC with pool and city views, asking P18M',
    outroEnabled: true,
    outroLine: 'Scan for listing details',
  }),
}).then(r => r.json())

const jobId = created.job?.id ?? created.id
console.log('Job created:', jobId)

// ── 2. Upload photos + branding ────────────────────────────────────────────────
const form = new FormData()
form.append('files', fs.createReadStream('photo1.jpg'), 'photo1.jpg')
form.append('files', fs.createReadStream('photo2.jpg'), 'photo2.jpg')
form.append('files', fs.createReadStream('photo3.jpg'), 'photo3.jpg')
form.append('mediaNotes', JSON.stringify(['Living room', 'Master bedroom', 'Pool']))
form.append('logo', fs.createReadStream('homes-logo.png'), 'homes-logo.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')
form.append('logoDisplay', 'always')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrPosition', 'bottom-center')
form.append('qrDisplay', 'outro-only')

await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/upload`, {
  method: 'POST',
  headers: { ...headers, ...form.getHeaders() },
  body: form,
})
console.log('Media uploaded')

// ── 3. Start rendering ─────────────────────────────────────────────────────────
await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/render`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ captionsEnabled: false }),
})
console.log('Rendering started')

// ── 4. Poll until done ─────────────────────────────────────────────────────────
let status = 'queued'
while (!['completed', 'failed'].includes(status)) {
  await new Promise(r => setTimeout(r, 5000))
  const data = await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}`, { headers }).then(r => r.json())
  const job = data.job ?? data
  status = job.status
  console.log(`[${job.progress}%] ${job.message}`)

  if (status === 'completed') {
    console.log('Video ready')
  }
  if (status === 'failed') {
    console.error('Render failed:', job.error)
    process.exit(1)
  }
}

// ── 5. Download the MP4 ────────────────────────────────────────────────────────
const res = await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/video`, { headers })
res.body.pipe(fs.createWriteStream('output.mp4'))
console.log('Saved to output.mp4')
```

**Listing Showcase example** (polling/download identical to above):

```js
const created = await fetch(`${BASE_URL}/api/reels-maker/jobs`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    templateId: 'listing-showcase',
    aspectRatio: 'portrait',
    voiceOverEnabled: true,
    captionsEnabled: false,
    outroEnabled: true,
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

const jobId = created.job?.id ?? created.id

const form = new FormData()
form.append('files', fs.createReadStream('living-room.jpg'), 'living-room.jpg')
form.append('files', fs.createReadStream('pool.jpg'), 'pool.jpg')
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

await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/render`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
})
```

---

## Notes

- **Supported formats:** JPEG, PNG, HEIC, WEBP, AVIF (photos); MP4, MOV, M4V (videos).
- **Minimum media:** At least 1 image or video required. **5–10 stills** give the best cinematic results.
- **Render time:** 60–180 seconds depending on scene count and server load.
- **Output spec:** H.264 MP4, 1080×1920 @ 30fps (portrait) or 1920×1080 (landscape), CRF 17.
- **Job storage:** Jobs persist indefinitely. Clean up unused jobs with `DELETE /jobs/:id`.
- **API keys** are per-partner and can be revoked without affecting other integrations.
- **Workarounds to stop using:** fake last-frame end cards; compositing agent+logo into one full-reel watermark; relying on `reelBrief` alone to kill bottom karaoke (use `captionsEnabled: false`).

---

*For API key issuance or support, contact your Homes.ph integration contact. Partners can also download this file from Admin → Reels API keys.*
