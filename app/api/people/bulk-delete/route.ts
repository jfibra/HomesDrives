import { NextResponse } from 'next/server'

import { deletePeople } from '@/lib/people'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const personIds = Array.isArray(body?.personIds)
      ? body.personIds
          .filter((value: unknown): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean)
      : []

    const result = await deletePeople(personIds)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete people.' },
      { status: 500 },
    )
  }
}
