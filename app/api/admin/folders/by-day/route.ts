import { NextResponse } from 'next/server'

import { listFoldersCreatedByUploaderManilaDay, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    const uploaderCode = searchParams.get('uploaderCode') ?? ''
    const day = searchParams.get('day')?.trim() ?? ''
    const albumUserIdRaw = searchParams.get('albumUserId')?.trim() ?? ''
    const albumUserId =
      albumUserIdRaw && /^\d+$/.test(albumUserIdRaw) ? Number.parseInt(albumUserIdRaw, 10) : null

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }
    if (!day) {
      return NextResponse.json({ error: 'Missing day.' }, { status: 400 })
    }
    if (uploaderCode === '') {
      return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    const folders = await listFoldersCreatedByUploaderManilaDay({
      uploaderCode,
      day,
      albumUserId,
    })
    return NextResponse.json({ folders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    const status = /forbidden|not active|not found/i.test(message)
      ? 403
      : /^invalid day\.?$/i.test(message)
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
