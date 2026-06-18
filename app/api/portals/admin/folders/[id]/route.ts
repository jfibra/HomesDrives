import { NextResponse } from 'next/server'

import {
  deletePortalFolder,
  listPortalPhotos,
  requirePortalAdmin,
  updatePortalFolder,
} from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(
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
    const photos = await listPortalPhotos(id)
    return NextResponse.json({ photos })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load photos.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const adminCode = typeof body?.adminCode === 'string' ? body.adminCode.trim() : ''
    const folderName = typeof body?.folderName === 'string' ? body.folderName.trim() : undefined
    const isPublicVisible =
      typeof body?.isPublicVisible === 'boolean' ? body.isPublicVisible : undefined

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    if (folderName === undefined && isPublicVisible === undefined) {
      return NextResponse.json(
        { error: 'Provide folderName and/or isPublicVisible.' },
        { status: 400 },
      )
    }

    if (folderName !== undefined && !folderName) {
      return NextResponse.json({ error: 'Folder name cannot be empty.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)
    const folder = await updatePortalFolder(id, { folderName, isPublicVisible })
    return NextResponse.json({ folder })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update folder.'
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
    await deletePortalFolder(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete folder.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
