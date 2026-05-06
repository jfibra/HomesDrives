import { NextResponse } from 'next/server'

import { signUpCustomerUser } from '@/lib/server/albums'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body?.lastName === 'string' ? body.lastName.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber.trim() : ''
    const areaFocused = typeof body?.areaFocused === 'string' ? body.areaFocused.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'Please enter your first and last name.' },
        { status: 400 },
      )
    }
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 },
      )
    }
    if (!phoneNumber) {
      return NextResponse.json({ error: 'Please enter your phone number.' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    const user = await signUpCustomerUser({
      firstName,
      lastName,
      email,
      phoneNumber,
      areaFocused,
      password,
    })

    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          fullName: user.full_name,
          firstName: user.first_name,
          email: user.email,
          code: user.code,
          role: user.role,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sign up right now.'
    const status = /already (registered|exists)|duplicate|unique/i.test(message) ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
