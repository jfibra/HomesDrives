import { NextResponse } from 'next/server'

import { loginPortalAdmin } from '@/lib/portals/auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const albumUser = await loginPortalAdmin(email, password)

    return NextResponse.json({
      success: true,
      adminCode: albumUser.code,
      fullName: albumUser.full_name,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign in.'
    const status = /invalid email or password/i.test(message)
      ? 401
      : /admin access only/i.test(message)
        ? 403
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
