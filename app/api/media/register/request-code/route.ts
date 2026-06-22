import { NextResponse } from 'next/server'

import { requestMediaRegistrationCode } from '@/lib/server/media-registration'

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

    const result = await requestMediaRegistrationCode({
      firstName,
      lastName,
      email,
      phoneNumber,
      areaFocused,
      password,
    })

    if (result.skipVerification) {
      return NextResponse.json({
        success: true,
        skipVerification: true,
        message: 'Your account is ready. Check your email for your dashboard link and login details.',
        user: result.user,
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent. Check your email.',
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to send verification code right now.'
    const status = /already exists|wait \d+s/i.test(message)
      ? 409
      : /not set up yet/i.test(message)
        ? 503
        : 500

    return NextResponse.json({ error: message }, { status })
  }
}
