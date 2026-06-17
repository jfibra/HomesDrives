import { NextResponse } from 'next/server'

import { deletePortalPhoto, renamePortalPhoto, requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : ''

    if (!adminCode || !fileName) {
      return NextResponse.json({ error: 'Missing adminCode or fileName.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const photo = await renamePortalPhoto(id, fileName)
    return NextResponse.json({ photo })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to rename photo.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    await deletePortalPhoto(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete photo.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
