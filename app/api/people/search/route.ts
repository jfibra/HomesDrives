import { NextResponse } from 'next/server'

import { searchPeopleByFaceImage } from '@/lib/server/face-search'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const limitRaw = formData.get('limit')
    const limit =
      typeof limitRaw === 'string' && Number.isFinite(Number.parseInt(limitRaw, 10))
        ? Number.parseInt(limitRaw, 10)
        : 12

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Upload a face image.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await searchPeopleByFaceImage({
      imageBuffer: buffer,
      limit,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Face search failed.' },
      { status: 500 },
    )
  }
}
