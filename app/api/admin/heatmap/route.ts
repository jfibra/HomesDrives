import { NextResponse } from 'next/server'

import { getHeatmapData, requireAdminByCode } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const adminCode = searchParams.get('adminCode')?.trim() ?? ''
    const from = searchParams.get('from')?.trim() ?? ''
    const to = searchParams.get('to')?.trim() ?? ''

    if (!adminCode) return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    if (!from || !to) return NextResponse.json({ error: 'Missing from or to date.' }, { status: 400 })

    await requireAdminByCode(adminCode)
    const data = await getHeatmapData(from, to)
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load heatmap data.'
    const status = /forbidden|not active|not found/i.test(message) ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
