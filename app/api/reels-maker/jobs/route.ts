import { NextResponse } from 'next/server'

import { handleReelJobsGet, handleReelJobsPost } from '@/lib/reels-maker/api-handlers'
import { proxyReelsApiRequest } from '@/lib/server/reels-api-proxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const proxied = await proxyReelsApiRequest(request, '/api/reels-maker/jobs')
  if (proxied) return proxied
  return handleReelJobsGet()
}

export async function POST(request: Request) {
  const proxied = await proxyReelsApiRequest(request, '/api/reels-maker/jobs')
  if (proxied) return proxied
  return handleReelJobsPost(request)
}
