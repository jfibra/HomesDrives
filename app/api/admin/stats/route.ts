import { NextResponse } from 'next/server'

import { getAdminStats, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requireAdminByCode(adminCode)
    const stats = await getAdminStats()
    return NextResponse.json({ stats })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load admin stats.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
