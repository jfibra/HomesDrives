import { NextResponse } from 'next/server'

import { PHOTOGRAPHER_PORTAL_CODE } from '@/lib/portals/constants'
import {
  buildFolderTree,
  createPortalFolder,
  listPortalFoldersForUploader,
} from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const folders = await listPortalFoldersForUploader(PHOTOGRAPHER_PORTAL_CODE)
    return NextResponse.json({ folders, tree: buildFolderTree(folders) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load folders.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const folderName = typeof body?.folderName === 'string' ? body.folderName.trim() : ''
    const parentFolderId =
      typeof body?.parentFolderId === 'string' && body.parentFolderId.trim()
        ? body.parentFolderId.trim()
        : null

    if (!folderName) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 })
    }

    const folder = await createPortalFolder({
      uploaderCode: PHOTOGRAPHER_PORTAL_CODE,
      folderName,
      parentFolderId,
    })
    return NextResponse.json({ folder }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create folder.' },
      { status: 500 },
    )
  }
}
