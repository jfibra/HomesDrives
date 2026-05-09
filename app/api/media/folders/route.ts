import { NextResponse } from 'next/server'

import { listAllFoldersForAdmin, requireActiveMediaByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

/** Full folder directory for active media users (same payload as admin list; read-only use). */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const uploaderCode = searchParams.get('uploaderCode')?.trim() ?? ''

    if (!uploaderCode) {
      return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
    }

    await requireActiveMediaByCode(uploaderCode)
    const folders = await listAllFoldersForAdmin()
    return NextResponse.json({ folders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
