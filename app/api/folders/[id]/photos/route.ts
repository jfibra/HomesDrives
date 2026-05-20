import { NextResponse } from 'next/server'

import { listPhotosByFolderId } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing folder id.' }, { status: 400 })
    }
    const photos = await listPhotosByFolderId(id)
    return NextResponse.json({ photos })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load photos.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
