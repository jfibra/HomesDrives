import { NextResponse } from 'next/server'

import { verifyMediaRegistrationCode } from '@/lib/server/media-registration'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 },
      )
    }

    if (!code) {
      return NextResponse.json(
        { error: 'Please enter your 6-digit verification code.' },
        { status: 400 },
      )
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 },
      )
    }

    const result = await verifyMediaRegistrationCode({ email, code, password })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to verify your registration right now.'
    const status = /already exists|invalid|expired|no pending/i.test(message) ? 400 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
