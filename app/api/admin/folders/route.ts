import { NextResponse } from 'next/server'

import { listAllFoldersForAdmin, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    const folders = await listAllFoldersForAdmin()
    return NextResponse.json({ folders, totalCount: folders.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
