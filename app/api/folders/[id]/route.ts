import { NextResponse } from 'next/server'

import {
  deleteAlbumFolder,
  getUserByCode,
  updateAlbumFolder,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    const uploaderCode =
      typeof body?.uploaderCode === 'string' && body.uploaderCode.trim()
        ? body.uploaderCode.trim()
        : ''

    if (!uploaderCode) {
      return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
    }

    const user = await getUserByCode(uploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'Invalid uploader code.' }, { status: 404 })
    }

    const folder = await updateAlbumFolder({
      id,
      uploaderCode,
      folderName:
        typeof body?.folderName === 'string' && body.folderName.trim()
          ? body.folderName.trim()
          : undefined,
      fullAddress:
        typeof body?.fullAddress === 'string' ? body.fullAddress.trim() || null : undefined,
      street: typeof body?.street === 'string' ? body.street.trim() || null : undefined,
      city: typeof body?.city === 'string' ? body.city.trim() || null : undefined,
      province: typeof body?.province === 'string' ? body.province.trim() || null : undefined,
      zipCode: typeof body?.zipCode === 'string' ? body.zipCode.trim() || null : undefined,
      country: typeof body?.country === 'string' ? body.country.trim() || null : undefined,
      latitude:
        typeof body?.latitude === 'number' && Number.isFinite(body.latitude)
          ? body.latitude
          : undefined,
      longitude:
        typeof body?.longitude === 'number' && Number.isFinite(body.longitude)
          ? body.longitude
          : undefined,
      typeOfPlace: Array.isArray(body?.typeOfPlace)
        ? body.typeOfPlace
            .map((v: unknown) => (typeof v === 'string' ? v.trim() : ''))
            .filter(Boolean)
        : undefined,
      tags: Array.isArray(body?.tags)
        ? body.tags.map((v: unknown) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
        : undefined,
      notes: typeof body?.notes === 'string' ? body.notes : undefined,
      status:
        typeof body?.status === 'string' && ['active', 'archived'].includes(body.status)
          ? (body.status as 'active' | 'archived')
          : undefined,
    })

    return NextResponse.json({ folder })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update folder.' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const { searchParams } = new URL(request.url)
    const uploaderCode = searchParams.get('uploaderCode')?.trim()
    const withPhotos = searchParams.get('withPhotos') === 'true'

    if (!uploaderCode) {
      return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
    }

    const user = await getUserByCode(uploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'Invalid uploader code.' }, { status: 404 })
    }

    await deleteAlbumFolder({ id, uploaderCode, withPhotos })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to delete folder.' },
      { status: 500 },
    )
  }
}
