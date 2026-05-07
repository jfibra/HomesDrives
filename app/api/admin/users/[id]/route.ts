import { NextResponse } from 'next/server'

import {
  deleteAdminAlbumUser,
  isAlbumUserRole,
  requireAdminByCode,
  updateAdminAlbumUser,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

function parseId(value: string): number | null {
  const id = Number.parseInt(value, 10)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await context.params
    const id = parseId(rawId)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 })
    }

    const body = await request.json().catch(() => null)
    const adminCode =
      typeof body?.adminCode === 'string' && body.adminCode.trim() ? body.adminCode.trim() : ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)

    const updates: Parameters<typeof updateAdminAlbumUser>[0] = { id }
    if (typeof body?.firstName === 'string' && body.firstName.trim()) {
      updates.firstName = body.firstName.trim()
    }
    if (typeof body?.lastName === 'string' && body.lastName.trim()) {
      updates.lastName = body.lastName.trim()
    }
    if (typeof body?.email === 'string' && body.email.trim()) {
      updates.email = body.email.trim().toLowerCase()
    }
    if (typeof body?.phoneNumber === 'string' && body.phoneNumber.trim()) {
      updates.phoneNumber = body.phoneNumber.trim()
    }
    if (typeof body?.areaFocused === 'string' && body.areaFocused.trim()) {
      updates.areaFocused = body.areaFocused.trim()
    }
    if (typeof body?.password === 'string' && body.password.length >= 8) {
      updates.password = body.password
    }
    if (isAlbumUserRole(body?.role)) {
      updates.role = body.role
    }
    if (body?.status === 'active' || body?.status === 'inactive' || body?.status === 'suspended') {
      updates.status = body.status
    }

    const user = await updateAdminAlbumUser(updates)
    return NextResponse.json({ user })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update user.'
    const status = /forbidden|not active|not found/i.test(message)
      ? 403
      : /duplicate|unique|already/i.test(message)
        ? 409
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await context.params
    const id = parseId(rawId)
    if (id === null) {
      return NextResponse.json({ error: 'Invalid user id.' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    await deleteAdminAlbumUser({ id })
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete user.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

