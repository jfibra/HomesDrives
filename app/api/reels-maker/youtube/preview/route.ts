import { NextResponse } from 'next/server'

import { getYouTubeTrackPreview } from '@/lib/reels-maker/youtube-music'
import { isValidYouTubeMusicUrl } from '@/lib/reels-maker/youtube-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string }
    const url = body.url?.trim() ?? ''
    if (!url || !isValidYouTubeMusicUrl(url)) {
      return NextResponse.json({ error: 'Paste a valid YouTube music link.' }, { status: 400 })
    }

    const preview = await getYouTubeTrackPreview(url)
    return NextResponse.json({ preview })
  } catch (error) {
    console.error('[reels-maker/youtube/preview]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load YouTube track.' },
      { status: 500 },
    )
  }
}
