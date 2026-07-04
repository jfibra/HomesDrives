import { NextResponse } from 'next/server'

import { getPhotoFaceAnnotations } from '@/lib/faces'

export const runtime = 'nodejs'

type RouteContext = {
  params: Promise<{ photoId: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { photoId } = await context.params
    const faces = await getPhotoFaceAnnotations(photoId)
    return NextResponse.json({ faces })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load faces for photo.' },
      { status: 500 },
    )
  }
}
