import { handleReelJobRender } from '@/lib/reels-maker/api-handlers'
import { proxyReelsApiRequest } from '@/lib/server/reels-api-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const proxied = await proxyReelsApiRequest(request, `/api/reels-maker/jobs/${jobId}/render`)
  if (proxied) return proxied
  return handleReelJobRender(jobId, request)
}
