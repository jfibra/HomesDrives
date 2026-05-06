import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/server/albums'

export const runtime = 'nodejs'

function getRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
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

    // Validate credentials via Supabase Auth
    const supabaseAnon = createClient(
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { error: authError } = await supabaseAnon.auth.signInWithPassword({ email, password })

    if (authError) {
      console.error('[login] Supabase Auth error:', authError.message, authError.status)
      return NextResponse.json({ error: authError.message }, { status: 401 })
    }

    // Look up the album_users row by email. If `code` is supplied (e.g. the
    // user is signing in via /<code>) we also enforce it matches.
    const supabaseAdmin = createSupabaseAdminClient()
    let query = supabaseAdmin
      .from('album_users')
      .select('id, full_name, status, role, area_focused, code')
      .eq('email', email)
    if (code) query = query.eq('code', code)

    const { data: albumUser, error: dbError } = await query.maybeSingle()

    if (dbError) {
      throw new Error(dbError.message)
    }

    if (!albumUser) {
      return NextResponse.json(
        {
          error: code
            ? 'This email does not match the account for this dashboard.'
            : 'No account found with that email.',
        },
        { status: 401 },
      )
    }

    if (albumUser.status !== 'active') {
      return NextResponse.json({ error: 'Your account is inactive. Contact your manager.' }, { status: 403 })
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
