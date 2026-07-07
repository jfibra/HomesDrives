import { handleYouTubePreview } from '@/lib/reels-maker/api-handlers'
import { proxyReelsApiRequest } from '@/lib/server/reels-api-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const proxied = await proxyReelsApiRequest(request, '/api/reels-maker/youtube/preview')
  if (proxied) return proxied
  return handleYouTubePreview(request)
}
