import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { getUserByEmail } from '@/lib/server/albums'

export const runtime = 'nodejs'

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function mapAuthErrorMessage(message: string) {
  if (/invalid login credentials/i.test(message)) {
    return 'Incorrect email or password. Use the same password from your welcome email, or ask support to reset it.'
  }
  if (/email not confirmed/i.test(message)) {
    return 'Your email is not confirmed yet. Check your inbox or contact support.'
  }
  return message
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const albumUser = await getUserByEmail(email)

    if (!albumUser) {
      return NextResponse.json({ error: 'No account found with that email.' }, { status: 401 })
    }

    if (code && albumUser.code !== code) {
      return NextResponse.json(
        {
          error:
            'This email does not match this dashboard link. Open your personal Homes.ph link from your welcome email, or sign in at /login.',
        },
        { status: 401 },
      )
    }

    if (albumUser.status !== 'active') {
      return NextResponse.json({ error: 'Your account is inactive. Contact your manager.' }, { status: 403 })
    }

    // Validate credentials via Supabase Auth after we know the album account exists.
    const supabaseAnon = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { error: authError } = await supabaseAnon.auth.signInWithPassword({ email, password })

    if (authError) {
      console.error('[login] Supabase Auth error:', authError.message, authError.status, email)
      return NextResponse.json({ error: mapAuthErrorMessage(authError.message) }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: albumUser.id,
        fullName: albumUser.full_name,
        role: albumUser.role ?? 'media',
        areaFocused: albumUser.area_focused,
        code: albumUser.code,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to authenticate right now.',
      },
      { status: 500 },
    )
  }
}
