import { NextResponse } from 'next/server'

import { deleteAlbumFolderAsAdmin, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function DELETE(
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
    const withPhotos = searchParams.get('withPhotos') === 'true'

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    await deleteAlbumFolderAsAdmin({ id: folderId, withPhotos })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete folder.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
