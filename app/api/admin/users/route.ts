import { NextResponse } from 'next/server'

import {
  createAdminAlbumUser,
  isAlbumUserRole,
  listAllAlbumUsers,
  requireAdminByCode,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    const users = await listAllAlbumUsers()
    return NextResponse.json({ users })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load users.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const adminCode =
      typeof body?.adminCode === 'string' && body.adminCode.trim() ? body.adminCode.trim() : ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)

    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const areaFocused = typeof body?.areaFocused === 'string' ? body.areaFocused.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const role = isAlbumUserRole(body?.role) ? body.role : 'media'
    const status: 'active' | 'inactive' | 'suspended' =
      body?.status === 'inactive' || body?.status === 'suspended' ? body.status : 'active'

    if (!firstName || !lastName || !email || !phoneNumber || !areaFocused || !password) {
      return NextResponse.json(
        {
          error:
            'Missing required fields: firstName, lastName, email, phoneNumber, areaFocused, password.',
        },
        { status: 400 },
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    const user = await createAdminAlbumUser({
      firstName,
      lastName,
      email,
      phoneNumber,
      areaFocused,
      password,
      role,
      status,
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create user.'
    const status = /forbidden|not active/i.test(message)
      ? 403
      : /already (registered|exists)|duplicate|unique/i.test(message)
        ? 409
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
