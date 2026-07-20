import { config } from 'dotenv'
import { resolve } from 'path'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import {
  handleReelJobDelete,
  handleReelJobGet,
  handleReelJobRender,
  handleReelJobUpload,
  handleReelJobUploadFinalize,
  handleReelJobUploadPresign,
  handleReelJobMusicChunkUpload,
  handleReelJobVideo,
  handleReelJobThumbnail,
  handleReelJobsGet,
  handleReelJobsPost,
  handleYouTubeCookiesUpload,
  handleYouTubePreview,
  handleYouTubeStreamInfo,
} from '../../lib/reels-maker/api-handlers'
import { createApiKey, listApiKeys, revokeApiKey, validateApiKey } from './api-keys'

config({ path: resolve(process.cwd(), '.env') })

const PORT = Number.parseInt(process.env.REELS_API_PORT ?? '8001', 10)

function getAllowedOrigins(): string[] {
  const fromEnv = process.env.REELS_API_ALLOWED_ORIGINS?.split(',').map((v) => v.trim()).filter(Boolean)
  if (fromEnv?.length) return fromEnv
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return appUrl ? [appUrl] : ['*']
}

type AuthContext = { req: { header: (name: string) => string | undefined } }

async function isAuthorizedRequest(c: AuthContext): Promise<boolean> {
  // 1. Internal shared secret (Vercel → EC2 proxy)
  const secret = process.env.REELS_API_SECRET?.trim()
  if (secret) {
    const provided = c.req.header('x-reels-api-secret')
    if (provided === secret) return true
  }

  // 2. External API key (third-party integrations)
  const apiKey = c.req.header('x-api-key')
  if (apiKey) {
    const valid = await validateApiKey(apiKey)
    if (valid) return true
  }

  // 3. Allowed browser origin (same-site requests)
  const origin = c.req.header('origin')
  if (origin) {
    const allowed = getAllowedOrigins()
    if (allowed.includes('*')) return true
    return allowed.includes(origin)
  }

  // 4. Local same-machine requests (no secret, no origin)
  return !secret
}

function isAdminRequest(c: AuthContext): boolean {
  const adminSecret = process.env.REELS_API_ADMIN_SECRET?.trim()
  if (!adminSecret) return false
  return c.req.header('x-admin-secret') === adminSecret
}

const app = new Hono()

app.use('*', cors({
  origin: (origin) => {
    const allowed = getAllowedOrigins()
    if (allowed.includes('*')) return origin || '*'
    if (!origin) return allowed[0] ?? ''
    return allowed.includes(origin) ? origin : allowed[0] ?? ''
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Range', 'x-reels-api-secret', 'x-api-key', 'x-admin-secret'],
  exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  maxAge: 86400,
}))

// ─── Admin routes (API key management) ────────────────────────────────────────
app.use('/admin/*', (c, next) => {
  if (!isAdminRequest(c)) return c.json({ error: 'Unauthorized' }, 401)
  return next()
})

app.get('/admin/api-keys', async (c) => {
  const keys = await listApiKeys()
  return c.json({ keys })
})

app.post('/admin/api-keys', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}))
  const name = body.name?.trim()
  if (!name) return c.json({ error: 'name is required' }, 400)
  const created = await createApiKey(name)
  return c.json({ key: created }, 201)
})

app.delete('/admin/api-keys/:key', async (c) => {
  const revoked = await revokeApiKey(c.req.param('key'))
  if (!revoked) return c.json({ error: 'Key not found' }, 404)
  return c.json({ ok: true })
})

// ─── Reels API routes ──────────────────────────────────────────────────────────
app.use('/api/reels-maker/*', async (c, next) => {
  if (!(await isAuthorizedRequest(c))) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'reels-api',
    port: PORT,
  }),
)

app.get('/api/reels-maker/jobs', () => handleReelJobsGet())
app.post('/api/reels-maker/jobs', (c) => handleReelJobsPost(c.req.raw))

app.get('/api/reels-maker/jobs/:jobId', (c) => handleReelJobGet(c.req.param('jobId')))
app.delete('/api/reels-maker/jobs/:jobId', (c) => handleReelJobDelete(c.req.param('jobId')))

app.post('/api/reels-maker/jobs/:jobId/upload', (c) =>
  handleReelJobUpload(c.req.param('jobId'), c.req.raw),
)

app.post('/api/reels-maker/jobs/:jobId/upload/presign', (c) =>
  handleReelJobUploadPresign(c.req.param('jobId'), c.req.raw),
)

app.post('/api/reels-maker/jobs/:jobId/upload/finalize', (c) =>
  handleReelJobUploadFinalize(c.req.param('jobId'), c.req.raw),
)

app.post('/api/reels-maker/jobs/:jobId/upload/music-chunk', (c) =>
  handleReelJobMusicChunkUpload(c.req.param('jobId'), c.req.raw),
)

app.post('/api/reels-maker/jobs/:jobId/render', (c) =>
  handleReelJobRender(c.req.param('jobId'), c.req.raw),
)

app.get('/api/reels-maker/jobs/:jobId/video', (c) =>
  handleReelJobVideo(c.req.param('jobId'), c.req.raw),
)
app.get('/api/reels-maker/jobs/:jobId/thumbnail', (c) =>
  handleReelJobThumbnail(c.req.param('jobId'), c.req.raw),
)

app.post('/api/reels-maker/youtube/preview', (c) => handleYouTubePreview(c.req.raw))
app.post('/api/reels-maker/youtube/stream-info', (c) => handleYouTubeStreamInfo(c.req.raw))
app.put('/api/reels-maker/youtube/cookies', (c) => handleYouTubeCookiesUpload(c.req.raw))

console.log(`[reels-api] listening on http://0.0.0.0:${PORT}`)

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '0.0.0.0',
})
