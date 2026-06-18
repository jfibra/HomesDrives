import { NextResponse } from 'next/server'

import { listPortalPhotosForFolderTree } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) {
      return NextResponse.json({ error: 'Missing folder id.' }, { status: 400 })
    }

    const result = await listPortalPhotosForFolderTree(id, { publicOnly: true })
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load photos.'
    const status = /not found/i.test(message) ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
