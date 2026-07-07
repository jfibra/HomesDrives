import {
  handleReelJobDelete,
  handleReelJobGet,
} from '@/lib/reels-maker/api-handlers'
import { proxyReelsApiRequest } from '@/lib/server/reels-api-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function GET(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const proxied = await proxyReelsApiRequest(request, `/api/reels-maker/jobs/${jobId}`)
  if (proxied) return proxied
  return handleReelJobGet(jobId)
}

export async function DELETE(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const proxied = await proxyReelsApiRequest(request, `/api/reels-maker/jobs/${jobId}`)
  if (proxied) return proxied
  return handleReelJobDelete(jobId)
}
