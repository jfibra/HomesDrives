import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!code || !password) {
      return NextResponse.json({ error: 'Missing code or password.' }, { status: 400 })
    }

    const supabaseAdmin = createSupabaseAdminClient()
    const { data, error } = await supabaseAdmin
      .from('album_users')
      .select('status, password')
      .eq('code', code)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    if (!data || data.status !== 'active' || data.password !== password) {
      return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to authenticate right now.',
      },
      { status: 500 },
    )
  }
}
