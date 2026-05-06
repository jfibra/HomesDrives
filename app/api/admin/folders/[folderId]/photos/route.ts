import { NextResponse } from 'next/server'

import { listPhotosByFolderId, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ folderId: string }> },
) {
  try {
    const { folderId } = await context.params
    if (!folderId) {
      return NextResponse.json({ error: 'Missing folderId.' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    const photos = await listPhotosByFolderId(folderId)
    return NextResponse.json({ photos })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load photos.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
