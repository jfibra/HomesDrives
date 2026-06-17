import { NextResponse } from 'next/server'

import { buildFolderTree, listPortalFoldersForAdmin, requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const folders = await listPortalFoldersForAdmin()
    return NextResponse.json({ folders, tree: buildFolderTree(folders) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
