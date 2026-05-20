import { NextResponse } from 'next/server'

import { listAllFoldersForAdmin } from '@/lib/server/albums'

export const runtime = 'nodejs'

/** Public endpoint — returns all folders that have coordinates, for map display. */
export async function GET() {
  try {
    const all = await listAllFoldersForAdmin()
    const folders = all.filter((f) => f.latitude != null && f.longitude != null)
    return NextResponse.json({ folders })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load folders.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
