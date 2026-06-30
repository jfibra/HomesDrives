import { NextResponse } from 'next/server'

import { bulkRenamePortalPhotos, requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

type BulkRenameRequestBody = {
  adminCode?: string
  renames?: Array<{
    fileName?: string
    id?: string
  }>
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as BulkRenameRequestBody | null
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const renames = Array.isArray(body?.renames) ? body.renames : []

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)

    const normalizedRenames = renames
      .map((rename) => ({
        id: typeof rename.id === 'string' ? rename.id.trim() : '',
        fileName: typeof rename.fileName === 'string' ? rename.fileName.trim() : '',
      }))
      .filter((rename) => rename.id && rename.fileName)

    if (normalizedRenames.length === 0) {
      return NextResponse.json({ error: 'Choose at least one photo to rename.' }, { status: 400 })
    }

    const photos = await bulkRenamePortalPhotos(normalizedRenames)
    return NextResponse.json({ photos, renamedCount: photos.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to rename photos.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
