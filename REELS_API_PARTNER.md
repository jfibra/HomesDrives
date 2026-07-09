# Homes.ph Reels API — Partner Integration Guide

Generate professional AI-edited property reels (short-form videos) through the Homes.ph Reels service. The API handles everything: AI story planning, cinematic Ken Burns motion, color grading, animated text overlays, voiceover narration, music mixing, and final MP4 export.

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
  "templateId": "real-estate",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "reelBrief": "3-bedroom luxury condo in BGC with pool and city views, asking P18M",
  "outroEnabled": true,
  "outroLine": "Contact us for a private showing"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `templateId` | string | ✅ | Visual style — see [Templates](#templates) |
| `aspectRatio` | `"portrait"` \| `"landscape"` | No | `portrait` = 9:16 for Reels/TikTok (default). `landscape` = 16:9 for YouTube/Facebook. |
| `voiceOverEnabled` | boolean | No | Generate AI voiceover narration |
| `reelBrief` | string | No | Property description for AI story generation |
| `outroEnabled` | boolean | No | Add branded outro card. Default: `true` |
| `outroLine` | string | No | Custom call-to-action on the outro card |

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
| `logo` | File (PNG/JPG) | Optional watermark logo. |
| `logoPosition` | string | `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"` |
| `qr` | File (PNG/JPG) | Optional QR code image (e.g. linking to the listing). Rendered inside a white box container so it stays scannable over video. |
| `qrEnabled` | string | `"true"` to enable rendering the QR code. |
| `qrPosition` | string | `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"` — defaults to `"bottom-right"`. |

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

`role`: `"media"`, `"music"`, `"logo"`, or `"qr"`.

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
  "voiceOverEnabled": false,
  "templateId": "luxury"
}
```

**Response `200`:** `{ "ok": true }`

Rendering is **asynchronous**. It runs through these stages:

```
queued → analyzing → generating_story → writing_captions
       → creating_voiceover → rendering → uploading_result → completed
```

Typical time: **60–180 seconds**, depending on the number of photos and server load.

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
