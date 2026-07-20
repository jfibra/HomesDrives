# Homes.ph Reels API — Partner Integration Guide

Generate professional AI-edited property reels (short-form videos) through the Homes.ph Reels service. The API handles everything: AI story planning, **cinematic camera moves** (dolly / push / float — not a basic slideshow), purposeful transitions, color grading with film grain, slanted lower-thirds, voiceover narration, music mixing, **branded mascot outro**, and final MP4 export.

---

## What’s new (for API partners)

You do **not** need a new client protocol. Use the same 5-step workflow. Copy the branding recipe below so your reels match the current Homes.ph edit.

### Reel structure (automatic)

```
1. Photo tour              — starts immediately (no intro card)
2. Branded outro           — Reels (~4.5s) or YouTube landscape (~5s)
```

| Beat | What partners see | How to enable |
|---|---|---|
| **Photo tour** | Listing images play first with cinematic moves + slanted lower-thirds; optional top-center logo watermark | Photos + optional `logoPosition=top-center` / `logoDisplay=always` |
| **Outro (Reels)** | Navy mascot plate → top **logo** → circular **agent photo** → **name / phone** → **QR** | `outroEnabled: true` + upload `logo` / `qr` / `agentHeadshot` + set `agentName` / `agentPhone` |
| **Outro (YouTube)** | Clean navy+mascot plate → **logo** top-left → **listing title/details** → **large QR** right | `outputFormat: "youtube"` + `outroEnabled: true` + `listingTitle` / `listingDetails` + upload `logo` + `qr` |

### Control vs automatic

| You control | Automatic (server) |
|---|---|
| Photos, music, logo, QR, agent headshot | Camera moves (dolly, corner push, float, drift…) |
| `templateId`, `reelBrief` | Non-uniform scene timing (hook → hero → detail → closing) |
| `logoPosition` / `logoDisplay` | Strongest shot first + cinematic transitions |
| `qrPosition` / `qrDisplay` | Film grain + stronger grade |
| `captionsEnabled: false` | Slanted lower-thirds |
| `outroEnabled` + `outroLine` + agent fields | **Navy mascot branded outro** |
| Listing fields (price, beds…) | Price **count-up** + feature chips (`listing-showcase`) |

**Important for client apps:**

1. **Do not burn your own karaoke captions** — bottom sentence subtitles are never burned in. Short slanted titles still appear.
2. **Do not append a fake “end card” photo** as the last media file — use `qrDisplay: "outro-only"` plus `outroEnabled` and upload `logo` / `qr` / `agentHeadshot`.
3. **Do not send motion/transition enums** — the server chooses them. A good `reelBrief` still improves story and VO.
4. **Recommended branding create body** always includes `"captionsEnabled": false` and `"outroEnabled": true`.
5. **Use a white / light logo** for best contrast on the dark navy outro plate (e.g. `whiteLogo.png` style).
6. **Prefer a square-ish headshot** — the server circle-crops it for the outro.

See [Branded outro](#branded-outro), [Cinematic edit quality (Phase 1)](#cinematic-edit-quality-phase-1), and [Homes.ph branding layout](#homesp-branding-layout-recommended).

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
6. GET    /api/reels-maker/jobs/:id/thumbnail → YouTube only: download outro still (custom thumbnail)
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
  "voiceGender": "woman",
  "captionsEnabled": false,
  "reelBrief": "3-bedroom luxury condo in BGC with pool and city views, asking P18M",
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "agentName": "Maria Santos",
  "agentPhone": "+63 917 000 0000"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `templateId` | string | ✅ | Visual style — see [Templates](#templates). Prefer `social-trend`, `luxury`, or `listing-showcase`. |
| `aspectRatio` | `"portrait"` \| `"landscape"` | No | `portrait` = 9:16 for Reels/TikTok (default). `landscape` = 16:9 for YouTube/Facebook. Forced to `landscape` when `outputFormat` is `"youtube"`. |
| `outputFormat` | `"reels"` \| `"youtube"` | No | Default `"reels"` (portrait mascot outro). Use **`"youtube"`** for 16:9 videos with the **YouTube landscape outro** (title + details + large QR). Send on **create and/or render**. |
| `listingTitle` | string | No | YouTube outro primary line(s). Use `\n` for name + price on separate lines. Falls back to `listingAddress` / story title. Send on **create and/or render**. |
| `listingTitleColor` | string | No | YouTube outro **title** hex color (e.g. `"#F4AA1D"`). Title block only — `listingDetails` stays white/light. Default white. |
| `listingDetails` | string | No | YouTube outro secondary line (e.g. `3BR · ₱18M · BGC`). Send on **create and/or render**. |
| `cameraMotion` | `"cinematic"` \| `"subtle"` \| `"off"` | No | Photo-tour motion. **YouTube defaults to `subtle`**. Use `"off"` for **static full-bleed** stills (cover crop, no Ken Burns — no side letterbox bars). Upload native photos; do **not** pre-letterbox with blue/black bars. |
| `voiceOverEnabled` | boolean | No | Generate AI voiceover narration (**audio only** — no karaoke burn-in) |
| `voiceGender` | `"woman"` \| `"man"` | No | Narrator voice. Default `"woman"`. Also accepts `"female"` / `"male"`. |
| `captionsEnabled` | boolean | No | Prefer `false`. Karaoke subtitles are **never** burned into the video; bottom scene **titles** still appear. |
| `subtitlesEnabled` | boolean | No | Alias for `captionsEnabled`. |
| `reelBrief` | string | No | Property description — improves AI story, scene order, and voiceover |
| `outroEnabled` | boolean | No | Default `true`. **Reels:** builds the portrait mascot outro when logo/QR/agent content is present. **YouTube (`outputFormat: "youtube"`):** always builds the landscape plate (title/details/QR/logo composited). Also drives the spoken VO CTA when voiceover is on. |
| `outroLine` | string | No | Spoken / optional CTA line (e.g. `"Scan for listing details"`). Visual logo/QR/agent layout does **not** require this string — upload assets instead. |
| `agentName` | string | No | White name line on the branded outro (any template). |
| `agentPhone` | string | No | White phone line on the branded outro (any template). |
| `agentEmail` | string | No | Optional secondary line on the outro. |
| `agentAgencyName` | string | No | Used on the outro when `agentName` is omitted. |

**`listing-showcase` fields** — only used when `templateId` is `"listing-showcase"` (see [Listing Showcase](#listing-showcase-template)):

| Field | Type | Description |
|---|---|---|
| `listingPrice` | string | e.g. `"P18,000,000"`. **Count-up** price animation on every photo. Also accepts `₱12.5M` / `PHP 8.2M`. |
| `listingAddress` | string | Shown under the price; also used as the reel title. |
| `listingBeds` | string | e.g. `"3"` — shown as a feature chip |
| `listingBaths` | string | e.g. `"2"` — shown as a feature chip |
| `listingSqft` | string | e.g. `"120"` — shown as a feature chip |
| `listingUrl` | string | Listing page URL — documentation only; upload the QR image via the `qr` upload field. |

**Response `201`:**

```json
{
  "job": {
    "id": "01HXYZ...",
    "status": "queued",
    "templateId": "social-trend",
    "aspectRatio": "portrait",
    "voiceOverEnabled": true,
    "voiceGender": "woman",
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
| `logo` | File (PNG/JPG) | Brand mark. Prefer **white / light**. Used as the **large top watermark** during photos (same scale as outro, with a soft **full-width** black bar behind it) and on the left tab of the lower-third + top of the branded **outro**. |
| `logoEnabled` | string | `"true"` to enable. |
| `logoPosition` | string | `"top-left"`, `"top-right"`, `"top-center"`, `"bottom-left"`, `"bottom-right"`, `"bottom-center"`. Use **`top-center`** for Homes.ph watermark during the photo tour. Ignored by `listing-showcase` (logo only on the outro). |
| `logoDisplay` | string | `"always"` (default), `"photos-only"`, or `"outro-only"`. See [Logo watermark vs outro](#logo-watermark-vs-outro). Also honors `skipOutroWatermark=true` / `logoApplyToOutro=false` as aliases for photos-only. Ignored by `listing-showcase`. |
| `accentLogo` | File (PNG/JPG) | Optional mark for the **left blue logo tab** on the lower-third (beside the white title). When set, it replaces `logo` in that tab only — top watermark / outro still use `logo`. |
| `accentLogoEnabled` | string | `"true"` to enable (defaults to true when `accentLogo` is uploaded). |
| `qr` | File (PNG/JPG) | Listing QR. Prefer `qrDisplay=outro-only` so it only appears on the branded outro (white pad). |
| `qrEnabled` | string | `"true"` to enable. |
| `qrPosition` | string | Same values as `logoPosition` — defaults to `"bottom-right"`. Only matters if `qrDisplay=always`. Ignored by `listing-showcase`. |
| `qrDisplay` | string | `"always"` or **`"outro-only"`** (recommended — QR on branded outro only, not over property shots). Ignored by `listing-showcase`. |
| `agentHeadshot` | File (PNG/JPG) | Agent photo for the branded outro (circle-cropped + white ring). Works on **any** template when `outroEnabled`. |
| `agentHeadshotEnabled` | string | `"true"` to enable. |

**Homes.ph branding upload (copy-paste — watermark + full outro):**

```js
form.append('logo', fs.createReadStream('homes-logo-white.png'), 'homes-logo-white.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')
form.append('logoDisplay', 'always')
// Optional aliases (same effect as photos-only when a branded outro is built):
// form.append('skipOutroWatermark', 'true')
// form.append('logoApplyToOutro', 'false')
form.append('accentLogo', fs.createReadStream('agency-mark.png'), 'agency-mark.png')
form.append('accentLogoEnabled', 'true')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrPosition', 'bottom-center')
form.append('qrDisplay', 'outro-only')
form.append('agentHeadshot', fs.createReadStream('agent-photo.jpg'), 'agent-photo.jpg')
form.append('agentHeadshotEnabled', 'true')
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
form.append('logo', fs.createReadStream('homes-logo-white.png'), 'homes-logo-white.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')
form.append('logoDisplay', 'always')
// Optional aliases (same effect as photos-only when a branded outro is built):
// form.append('skipOutroWatermark', 'true')
// form.append('logoApplyToOutro', 'false')
form.append('accentLogo', fs.createReadStream('agency-mark.png'), 'agency-mark.png')
form.append('accentLogoEnabled', 'true')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrPosition', 'bottom-center')
form.append('qrDisplay', 'outro-only')
form.append('agentHeadshot', fs.createReadStream('agent-photo.jpg'), 'agent-photo.jpg')
form.append('agentHeadshotEnabled', 'true')

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

`role`: `"media"`, `"music"`, `"logo"`, `"qr"`, or `"agentHeadshot"` (agent photo for branded outro — any template).

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
  "voiceGender": "man",
  "captionsEnabled": false,
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "templateId": "social-trend",
  "agentName": "Maria Santos",
  "agentPhone": "+63 917 000 0000"
}
```

| Field | Notes |
|---|---|
| `captionsEnabled` / `subtitlesEnabled` | Prefer `false`. Voiceover still plays; short bottom **titles** still appear. Karaoke subtitles are never burned into the MP4. |
| `voiceGender` | `"woman"` (default) or `"man"`. Also accepts `"female"` / `"male"`. Override narrator voice at render time. |
| `outroEnabled` / `outroLine` | Spoken CTA + whether the branded mascot outro is built. |
| `agentName` / `agentPhone` / `agentEmail` / `agentAgencyName` | **Required for name/phone on the outro.** Works on **any** template (`social-trend`, `luxury`, `listing-showcase`, …). Send on **create and/or render**. |

**Response `200`:** `{ "jobId": "...", "started": true }`

Rendering is **asynchronous**. It runs through these stages:

```
queued → analyzing → generating_story → writing_captions
       → creating_voiceover → rendering → uploading_result → completed
```

Typical time: **~1–3 minutes** after these speed defaults (was often 5–10 on small servers). More photos / voiceover / logo watermark still adds time.

---

## What appears in the finished video

| Element | Behavior |
|---|---|
| **Cinematic photo motion** | Starts immediately. Dolly / push / track / float (server-chosen). Not a basic slideshow. |
| **Bottom titles** | Slanted broadcast lower-third (logo tab + white title ribbon + blue subtitle), slides in slowly left → right (~1.15s). |
| **Karaoke / subtitles** | **Never burned in.** Voiceover is audio-only. Choose narrator with `voiceGender`: `"woman"` (default) or `"man"`. |
| **Logo watermark** | Photo tour when `logoDisplay` is `always` or `photos-only`: **~50% frame width** logo on a **full-width soft black bar** (~12% opacity), fixed after camera moves. **Never stacks on the branded outro** — outro plate keeps a single top wordmark from uploaded `logo`. |
| **Lower-third logos** | Left navy tab = `accentLogo` if uploaded, otherwise `logo`. **`accentLogo` is lower-third only** (not on the outro). |
| **QR watermark** | Prefer `outro-only` so QR appears on the branded outro only. |
| **Branded outro** | When `outroEnabled` + branding/agent/QR: navy mascot plate → logo → circular agent photo → name/phone → QR (~4.5s). Static plate (no Ken Burns). **Official end card** — do not append a fake last photo as an end card. |
| **Listing price** | `listing-showcase` + `listingPrice` → **count-up**, then address + beds/baths/sqft **chips**. |
| **Social caption** | Job `caption` / hashtags in the API response are for posting copy — not burned into the video. |

---

## Branded outro

There is **no intro card** — the reel opens on listing photos.

When `outroEnabled` is true, a single end card uses the **navy Homes.ph plate** (gold corner shapes + waving mascot in the bottom-left), top → bottom:

| Layer | Source |
|---|---|
| Top logo | Uploaded `logo` (prefer white / light) |
| Circular photo | Uploaded `agentHeadshot` (circle-cropped) |
| Name | `agentName` — send on **create and/or render** (any template) |
| Phone | `agentPhone` — send on **create and/or render** (any template) |
| QR | Uploaded `qr` (white pad, centered above the mascot) |

Missing pieces are skipped and spacing tightens automatically (e.g. logo + QR only still works).

### Logo watermark vs outro

| `logoDisplay` | Photo tour watermark | Branded outro plate logo |
|---|---|---|
| `always` (default) | Yes (fixed, top-center) | Once from uploaded `logo` — **tour watermark is masked off outro frames** (no stacking) |
| `photos-only` | Yes (same as above) | Once from uploaded `logo` — watermark never on outro |
| `outro-only` | No | Once from uploaded `logo` |

Aliases on upload (multipart or finalize JSON): `skipOutroWatermark=true` or `logoApplyToOutro=false` → treat as `photos-only` (unless you already set `outro-only`).

**Recommended Homes.ph recipe:** `logoPosition=top-center` + `logoDisplay=always` (or `photos-only`) + `qrDisplay=outro-only` + branded outro fields. Do **not** burn the logo into stills or fake an end-card photo.

### YouTube posting (`outputFormat: "youtube"`)

Partners who need **landscape YouTube** videos use the same API with a different end card. When `outputFormat` is `"youtube"`, the server **always appends the YouTube landscape outro** (as long as `outroEnabled` is not `false`). You do **not** need agent fields for it to appear.

| | Reels (`outputFormat: "reels"`) | YouTube (`outputFormat: "youtube"`) |
|---|---|---|
| Frame | 9:16 portrait | **16:9 landscape** (forced) |
| Outro plate | Portrait navy mascot (logo → agent → QR) | **Clean navy + mascot BG** composited with logo / title / QR |
| Outro layout | Top logo · circular agent · name/phone · QR | **Logo top-left** · **listing title + details mid-left** · **large QR right** · mascot bottom-left (baked into plate) |
| Camera | `cinematic` pans (default) | **`subtle`** by default (or `"off"` for static **full-bleed** cover) |
| Admin UI | `/reels-maker` | `/youtube-maker` |

#### YouTube outro layout (what gets composited)

| Layer | Source | Notes |
|---|---|---|
| Background | Server plate (`youtube-outro-plate.png`) | Navy geometric pattern + waving mascot only — **no** baked logo / title / QR |
| Logo | Upload `logo` (white / light PNG) | Top-left (~20% width). Prefer uploading; without it the plate has no wordmark |
| Title | `listingTitle` (+ optional `listingTitleColor`) | Serif mid-left; default white. Set `listingTitleColor` (e.g. `#F4AA1D`) for gold/accent. `\n` splits lines (name + price). |
| Details | `listingDetails` | Smaller white/light sans under title (falls back to price · address / `outroLine`) |
| QR | Upload `qr` + `qrDisplay=outro-only` | Large white-padded QR, vertically centered on the right |

Tour watermark (if `logoDisplay=always` / `photos-only`) is **masked off** outro frames so the plate logo is not doubled.

#### Required for the YouTube outro to build

| Field | Required? | Notes |
|---|---|---|
| `outputFormat: "youtube"` | ✅ | On **create and/or render** (re-send on render is fine / recommended) |
| `outroEnabled: true` | ✅ | Default `true`; do not set `false` or the plate is skipped |
| `listingTitle` / `listingDetails` | Recommended | Shown on the plate; fallbacks exist (address / story title / `outroLine`) |
| `listingTitleColor` | Optional | Hex for title only (e.g. `"#F4AA1D"`); details stay white |
| Upload `logo` + `logoEnabled=true` | **Strongly recommended** | Top-left wordmark on the clean plate |
| Upload `qr` + `qrEnabled=true` + `qrDisplay=outro-only` | **Strongly recommended** | Large QR on the right |
| `agentName` / `agentPhone` / `agentHeadshot` | **Not used** | Portrait-outro only; omitting them does **not** suppress the YouTube plate |
| `logoDisplay: "photos-only"` | OK | Only affects tour watermark; **does not** suppress the YouTube plate |

If the outro fails after deploy, the job will **error** (not silently skip) with a clear message (e.g. missing plate asset on the EC2 host).

**Duration note:** Photo scenes are timed to the voice-over, then the YouTube plate (~5s) is **appended**. Final MP4 length is photo tour + outro (voice may end slightly before the plate finishes). Older builds incorrectly trimmed the file back to voice length and dropped the plate while still returning `completed` — that is fixed; re-render after deploy.

**Create body (YouTube):**

```json
{
  "templateId": "social-trend",
  "outputFormat": "youtube",
  "cameraMotion": "subtle",
  "voiceOverEnabled": true,
  "voiceGender": "woman",
  "captionsEnabled": false,
  "outroEnabled": true,
  "listingTitle": "BGC Corner Condo\n₱18,000,000",
  "listingTitleColor": "#F4AA1D",
  "listingDetails": "3BR · 2BA · Taguig",
  "reelBrief": "3-bedroom luxury condo in BGC with pool and city views",
  "outroLine": "Scan for listing details"
}
```

**Uploads (same endpoints as reels):**

```js
form.append('logo', logoFile, 'whiteLogo.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')   // tour watermark
form.append('logoDisplay', 'photos-only')  // or always — masked off outro either way

form.append('qr', qrFile, 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrDisplay', 'outro-only')
```

For **no zoom / no push** on landscape stills (images still fill 16:9 via cover crop):

```json
{ "outputFormat": "youtube", "cameraMotion": "off" }
```

Upload **native** property photos (portrait or landscape). Do **not** pre-pad with blue/black bars — the renderer fills the frame.

**Timeline for YouTube jobs:**

1. Photo tour (16:9) — subtle/off camera + lower-thirds + optional top watermark  
2. YouTube outro (~5s) — clean navy+mascot plate → logo top-left → title/details → QR right  

**Copy-paste create body for a full portrait (Reels) outro:**

```json
{
  "templateId": "social-trend",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "voiceGender": "woman",
  "captionsEnabled": false,
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "agentName": "Maria Santos",
  "agentPhone": "+63 917 000 0000",
  "reelBrief": "3BR luxury condo in BGC with pool and city views, asking P18M"
}
```

Then upload `logo` + `qr` (`qrDisplay=outro-only`) + `agentHeadshot` as shown in [Upload Media](#2-upload-media).

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
- **YouTube jobs:** also use `job.thumbnailUrl` / `GET …/thumbnail` for the outro still (YouTube custom thumbnail).
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

### 5b. Download YouTube thumbnail (outro still)

For `outputFormat: "youtube"` jobs, the API also saves a **PNG of the landscape outro** (logo + title/details + QR + mascot). Use this as the **custom thumbnail** when uploading to YouTube.

On a completed job:

```json
{
  "job": {
    "outputFormat": "youtube",
    "resultUrl": "https://…/reel-output.mp4",
    "thumbnailUrl": "https://…/youtube-thumbnail.png"
  }
}
```

```
GET /api/reels-maker/jobs/:jobId/thumbnail
x-api-key: rk_xxx
```

```
Content-Type: image/png
Content-Disposition: attachment; filename="youtube-thumbnail-….png"
```

```js
const res = await fetch(`${BASE_URL}/api/reels-maker/jobs/${jobId}/thumbnail`, {
  headers: { 'x-api-key': API_KEY },
})
if (res.ok) {
  res.body.pipe(fs.createWriteStream('youtube-thumbnail.png'))
}
```

| Field / endpoint | When |
|---|---|
| `job.thumbnailUrl` | Set on completed **YouTube** jobs (outro still in storage) |
| `GET …/thumbnail` | Same image with `Content-Disposition: attachment` |
| Reels jobs | No outro thumbnail (`thumbnailUrl` may be null or a draft preview photo) |

---

### 6. Other Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reels-maker/jobs` | List all jobs |
| `DELETE` | `/api/reels-maker/jobs/:id` | Delete a job and its files |
| `GET` | `/api/reels-maker/jobs/:id/thumbnail` | Download YouTube outro thumbnail (PNG) |
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

1. **Photo tour** — starts immediately with cinematic camera moves. Lower-third shows `listingPrice` as a **count-up**, then address + **beds / baths / sqft chips**.
2. **Branded outro** — navy mascot plate with top `logo`, circular `agentHeadshot`, `agentName` / `agentPhone`, and `qr`. Same outro used by other templates when branding is provided.

Because the logo and QR are embedded into the outro card, they are **not** also applied as a persistent corner watermark for this template — `logoPosition` / `qrPosition` / `logoDisplay` / `qrDisplay` are ignored (still upload `logo` + `qr` for the outro).

---

## Cinematic edit quality (Phase 1)

The server treats every reel as a **luxury motion edit**, not a slideshow:

| Area | Behavior |
|---|---|
| **Open** | First listing photo plays immediately (no intro card) |
| **Camera** | Dolly-in/out, corner push, vertical drift, horizontal track, float — avoids repeating the same move |
| **Timing** | Every photo holds **~2.35s** so soft ~0.5s blends still feel like a 2s stay |
| **Story order** | Strongest / highest-quality shot opens (hook first) |
| **Transitions** | Soft cinematic blends: dissolve, smooth L/R, slide, wipe-up (matched to pan direction) |
| **Grade** | Stronger template looks + subtle film grain |
| **Type** | Slanted lower-third (logo tab / white title / blue subtitle), slow left→right reveal |
| **Outro** | Navy mascot plate → logo → agent photo → name/phone → QR (~4.5s) when `outroEnabled` |

**Phase 2 (roadmap, not available yet):** AI depth/parallax, Remotion-grade motion graphics, true BPM beat sync, 60fps GPU encode.

Partners do **not** send motion/transition fields — the server chooses cinematic moves. Optional `reelBrief` still improves storytelling.

---

## Homes.ph branding layout (recommended)

Goal: photos **start immediately** · Homes.ph logo **top-center** during photos · **agent + QR only on branded mascot outro** · slanted lower-thirds · voiceover **without** karaoke · cinematic motion.

**Create:**

```json
{
  "templateId": "social-trend",
  "aspectRatio": "portrait",
  "voiceOverEnabled": true,
  "voiceGender": "woman",
  "captionsEnabled": false,
  "outroEnabled": true,
  "outroLine": "Scan for listing details",
  "agentName": "Maria Santos",
  "agentPhone": "+63 917 000 0000",
  "reelBrief": "3BR luxury condo in BGC with pool and city views, asking P18M"
}
```

For a **counting price** on every photo, use `templateId: "listing-showcase"` and set `listingPrice` (e.g. `"P18,000,000"`) — agent fields + outro work the same way.

**Upload (multipart):**

| Field | Value |
|---|---|
| `logo` | Homes.ph **white / light** mark — large top watermark + left lower-third tab + outro |
| `logoEnabled` | `"true"` |
| `logoPosition` | `"top-center"` |
| `logoDisplay` | `"always"` |
| `accentLogo` | Optional mark for the **left logo tab** on the lower-third (beside the title). Top watermark still uses `logo`. |
| `accentLogoEnabled` | `"true"` |
| `qr` | Listing QR image |
| `qrEnabled` | `"true"` |
| `qrPosition` | `"bottom-center"` (ignored when `outro-only`) |
| `qrDisplay` | `"outro-only"` |
| `agentHeadshot` | Agent photo (circle-cropped on outro) |
| `agentHeadshotEnabled` | `"true"` |

**Resulting timeline:**

1. Photos — cinematic motion + lower-thirds + top-center logo watermark  
2. Outro (~4.5s) — navy mascot plate → logo → agent → QR  

No need to append a fake end-card photo as the last media file.

### Quick reference — what partners can use

| Capability | How |
|---|---|
| Start on listing photos | Automatic (no intro card) |
| YouTube 16:9 + landscape outro | `outputFormat: "youtube"` + `outroEnabled: true` + `listingTitle` / `listingDetails` + upload `logo` + `qr` (`qrDisplay=outro-only`) |
| YouTube upload thumbnail (outro still) | After complete: `job.thumbnailUrl` or `GET /api/reels-maker/jobs/:id/thumbnail` |
| No zoom on YouTube stills | `cameraMotion: "off"` (full-bleed cover; or default `"subtle"`) |
| Logo top-center during photos | `logoPosition=top-center` + `logoDisplay=always` or `photos-only` (watermark masked off branded outro — no double logo) |
| Custom logo in left lower-third tab | Upload `accentLogo` (+ `accentLogoEnabled=true`) — lower-third only, not on outro |
| Logo only on outro (no watermark) | `logoDisplay=outro-only` (still upload `logo`) |
| Skip watermark on outro (alias) | `skipOutroWatermark=true` or `logoApplyToOutro=false` |
| QR / agent only at end | `qrDisplay=outro-only` + `agentHeadshot` + `agentName` / `agentPhone` |
| Full branded outro | `outroEnabled: true` + logo + QR + headshot + agent fields |
| No karaoke subtitles | `captionsEnabled: false` (karaoke never burned in either way) |
| Slanted lower-thirds | Automatic |
| Price count-up + chips | `templateId: "listing-showcase"` + `listingPrice` / beds / baths / sqft |
| Spoken CTA | `outroEnabled: true` + `outroLine` |
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
    voiceGender: 'woman', // or 'man'
    captionsEnabled: false,
    reelBrief: '3BR luxury condo in BGC with pool and city views, asking P18M',
    outroEnabled: true,
    outroLine: 'Scan for listing details',
    agentName: 'Maria Santos',
    agentPhone: '+63 917 000 0000',
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
form.append('logo', fs.createReadStream('homes-logo-white.png'), 'homes-logo-white.png')
form.append('logoEnabled', 'true')
form.append('logoPosition', 'top-center')
form.append('logoDisplay', 'always')
form.append('qr', fs.createReadStream('listing-qr.png'), 'listing-qr.png')
form.append('qrEnabled', 'true')
form.append('qrPosition', 'bottom-center')
form.append('qrDisplay', 'outro-only')
form.append('agentHeadshot', fs.createReadStream('agent-photo.jpg'), 'agent-photo.jpg')
form.append('agentHeadshotEnabled', 'true')

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
  body: JSON.stringify({
    captionsEnabled: false,
    agentName: 'Maria Santos',
    agentPhone: '+63 917 000 0000',
  }),
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
    voiceGender: 'woman', // or 'man'
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
- **Intro / outro assets:** Use a **white or light logo** for dark plates. Upload a clear agent headshot (any crop; server circle-crops). QR should be high-contrast PNG/JPG.
- **Render time:** ~1–3 minutes typical (scene count, voiceover, and server CPU still matter).
- **Output spec:** H.264 MP4, 1080×1920 @ 30fps (portrait) or 1920×1080 (landscape), CRF 17.
- **Job storage:** Jobs persist indefinitely. Clean up unused jobs with `DELETE /jobs/:id`.
- **API keys** are per-partner and can be revoked without affecting other integrations.
- **Agent name / phone on outro:** Always send `agentName` + `agentPhone` on create (and again on render if you want). Works for every `templateId` — not only `listing-showcase`. Do **not** burn contact text into the headshot image; the API draws them on the outro.
- **Workarounds to stop using:** fake last-frame end cards; burning logo into stills; compositing agent+logo into one full-reel watermark; burning name/phone into the headshot PNG; relying on `reelBrief` alone to kill bottom karaoke (use `captionsEnabled: false`).

---

*For API key issuance or support, contact your Homes.ph integration contact. Partners can also download this file from Admin → Reels API keys.*
