import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import { buildFolderTree, listPortalFoldersForUploader } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const folders = await listPortalFoldersForUploader(PHOTOGRAPHER_PORTAL_CODE)
    return NextResponse.json({ folders, tree: buildFolderTree(folders) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

