import { handleReelJobMusicChunkUpload } from '@/lib/reels-maker/api-handlers'
import { proxyReelsApiRequest } from '@/lib/server/reels-api-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const proxied = await proxyReelsApiRequest(
    request,
    `/api/reels-maker/jobs/${jobId}/upload/music-chunk`,
  )
  if (proxied) return proxied
  return handleReelJobMusicChunkUpload(jobId, request)
}
