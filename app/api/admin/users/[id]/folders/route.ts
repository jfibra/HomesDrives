import { NextResponse } from 'next/server'

import { listFoldersByUserId, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await context.params
    const id = Number.parseInt(rawId, 10)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    const folders = await listFoldersByUserId(id)
    return NextResponse.json({ folders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
