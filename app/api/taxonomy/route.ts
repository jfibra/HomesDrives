import { NextResponse } from 'next/server'

import {
  listAllowedPlaceTypes,
  listAllowedTags,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const [placeTypes, tags] = await Promise.all([
      listAllowedPlaceTypes(),
      listAllowedTags(),
    ])

    return NextResponse.json({ placeTypes, tags })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to load taxonomy right now.',
      },
      { status: 500 },
    )
  }
}