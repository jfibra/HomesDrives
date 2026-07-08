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
  handleReelJobsGet,
  handleReelJobsPost,
  handleYouTubeCookiesUpload,
  handleYouTubePreview,
  handleYouTubeStreamInfo,
} from '../../lib/reels-maker/api-handlers'

config({ path: resolve(process.cwd(), '.env') })

const PORT = Number.parseInt(process.env.REELS_API_PORT ?? '8001', 10)

function getAllowedOrigins(): string[] {
  const fromEnv = process.env.REELS_API_ALLOWED_ORIGINS?.split(',').map((v) => v.trim()).filter(Boolean)
  if (fromEnv?.length) return fromEnv
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return appUrl ? [appUrl] : ['*']
}

function isAuthorizedRequest(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const secret = process.env.REELS_API_SECRET?.trim()
  if (secret) {
    const provided = c.req.header('x-reels-api-secret')
    if (provided === secret) return true
  }

  const origin = c.req.header('origin')
  if (origin) {
    const allowed = getAllowedOrigins()
    if (allowed.includes('*')) return true
    return allowed.includes(origin)
  }

  // Local health checks / same-machine proxy without Origin
  return !secret
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
  allowHeaders: ['Content-Type', 'Range', 'x-reels-api-secret'],
  exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  maxAge: 86400,
}))

app.use('/api/reels-maker/*', async (c, next) => {
  if (!isAuthorizedRequest(c)) {
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

app.post('/api/reels-maker/youtube/preview', (c) => handleYouTubePreview(c.req.raw))
app.post('/api/reels-maker/youtube/stream-info', (c) => handleYouTubeStreamInfo(c.req.raw))
app.put('/api/reels-maker/youtube/cookies', (c) => handleYouTubeCookiesUpload(c.req.raw))

console.log(`[reels-api] listening on http://0.0.0.0:${PORT}`)

serve({
  fetch: app.fetch,
  port: PORT,
  hostname: '0.0.0.0',
})
