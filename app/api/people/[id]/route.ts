import { NextResponse } from 'next/server'

import { getPersonById, updatePersonName } from '@/lib/people'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'Missing name.' }, { status: 400 })
    }

    const existing = await getPersonById(id)
    if (!existing) {
      return NextResponse.json({ error: 'Person not found.' }, { status: 404 })
    }

    const person = await updatePersonName(id, name)
    return NextResponse.json({ person })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update person.' },
      { status: 500 },
    )
  }
}
