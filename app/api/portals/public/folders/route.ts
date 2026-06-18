import { NextResponse } from 'next/server'

import { buildFolderTree, listPortalFoldersForPublic } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const folders = await listPortalFoldersForPublic()
    return NextResponse.json({ folders, tree: buildFolderTree(folders) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
