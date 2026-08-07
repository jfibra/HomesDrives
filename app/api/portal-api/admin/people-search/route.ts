import { NextResponse } from 'next/server'

import { searchPeopleAndPhotosAcrossEvents } from '@/lib/portals/global-people-search'
import { requirePortalAdmin } from '@/lib/portals/storage'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const adminCode = url.searchParams.get('adminCode')?.trim() ?? ''
    const query = url.searchParams.get('q')?.trim() ?? ''

    if (!adminCode) {
      return NextResponse.json({ error: 'Missing adminCode.' }, { status: 400 })
    }

    await requirePortalAdmin(adminCode)

    if (query.length < 2) {
      return NextResponse.json({
        query,
        people: [],
        photos: [],
        message: 'Type at least 2 characters to search.',
      })
    }

    const result = await searchPeopleAndPhotosAcrossEvents({ query })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to search people and photos.' },
      { status: 500 },
    )
  }
}
