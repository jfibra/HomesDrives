import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { requirePhotographerSessionFromRequest } from '@/lib/portals/require-photographer-access'
import { deletePortalFolderForUploader } from '@/lib/portals/storage'

export const runtime = 'nodejs'

function accessErrorStatus(message: string) {
  return /access denied|incorrect pin|6-digit|session expired|full name/i.test(message)
    ? 401
    : /not found/i.test(message)
      ? 404
      : 500
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const eventSlug = searchParams.get('eventSlug')?.trim() ?? ''
    if (!id) return NextResponse.json({ error: 'Missing folder id.' }, { status: 400 })
    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }

    const { event } = await requirePhotographerSessionFromRequest(request, eventSlug)
    await deletePortalFolderForUploader(id, PHOTOGRAPHER_PORTAL_CODE, event.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete folder.'
    return NextResponse.json({ error: message }, { status: accessErrorStatus(message) })
  }
}
