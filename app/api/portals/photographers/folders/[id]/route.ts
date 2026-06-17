import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { deletePortalFolderForUploader } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'Missing folder id.' }, { status: 400 })

    await deletePortalFolderForUploader(id, PHOTOGRAPHER_PORTAL_CODE)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete folder.'
    const status = /not found/i.test(message) ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
