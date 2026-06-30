import { NextResponse } from 'next/server'

import { processPhotoFaces } from '@/lib/server/face-pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const photoId = typeof body?.photoId === 'string' ? body.photoId.trim() : ''

    if (!photoId) {
      return NextResponse.json({ error: 'Missing photoId.' }, { status: 400 })
    }

    const result = await processPhotoFaces(photoId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process faces.' },
      { status: 500 },
    )
  }
}
