import { NextResponse } from 'next/server'

import { updateAlbumUserOwnProfile } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const code = typeof body.uploaderCode === 'string' ? body.uploaderCode.trim() : ''
    if (!code) {
      return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
    }

    const firstName = typeof body.firstName === 'string' ? body.firstName : undefined
    const lastName = typeof body.lastName === 'string' ? body.lastName : undefined
    const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber : undefined
    const areaFocused = typeof body.areaFocused === 'string' ? body.areaFocused : undefined

    if (
      firstName === undefined &&
      lastName === undefined &&
      phoneNumber === undefined &&
      areaFocused === undefined
    ) {
      return NextResponse.json({ error: 'No profile fields to update.' }, { status: 400 })
    }

    const user = await updateAlbumUserOwnProfile({
      code,
      firstName,
      lastName,
      phoneNumber,
      areaFocused,
    })

    return NextResponse.json({
      user: {
        id: String(user.id),
        fullName: user.full_name,
        firstName: user.first_name,
        lastName: user.last_name,
        phoneNumber: user.phone_number,
        areaFocused: user.area_focused,
        email: user.email,
        code: user.code,
        avatarUrl: user.avatar_url ?? null,
        role: user.role,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile.'
    let status = 400
    if (/User not found/i.test(message)) status = 404
    else if (/not active|Only media/i.test(message)) status = 403
    return NextResponse.json({ error: message }, { status })
  }
}

