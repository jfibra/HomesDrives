import { NextResponse } from 'next/server'

import {
  createSupabaseAdminClient,
  deleteImageObject,
  movePhotoToFolder,
  updateAlbumPhotoTags,
} from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const supabaseAdmin = createSupabaseAdminClient()
    const { data: photo, error: selectError } = await supabaseAdmin
      .from('albums_photos')
      .select('id, bucket_name, storage_path')
      .eq('id', id)
      .single()

    if (selectError || !photo) {
      return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
    }

    await deleteImageObject(photo.bucket_name, photo.storage_path)

    const { error: deleteError } = await supabaseAdmin
      .from('albums_photos')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to delete the photo right now.',
      },
      { status: 500 },
    )
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params
    const body = await request.json()

    // ── Move photo to a different folder ──────────────────────────────────────
    if (body?.action === 'move') {
      const uploaderCode =
        typeof body?.uploaderCode === 'string' && body.uploaderCode.trim()
          ? body.uploaderCode.trim()
          : null

      if (!uploaderCode) {
        return NextResponse.json({ error: 'Missing uploaderCode.' }, { status: 400 })
      }

      const targetFolderId =
        body?.targetFolderId === null
          ? null
          : typeof body?.targetFolderId === 'string' && body.targetFolderId.trim()
            ? body.targetFolderId.trim()
            : null

      const photo = await movePhotoToFolder({ photoId: id, targetFolderId, uploaderCode })
      return NextResponse.json({ photo })
    }

    // ── Update photo tags / location metadata ─────────────────────────────────
    const city = typeof body?.city === 'string' && body.city.trim() ? body.city.trim() : null
    const country =
      typeof body?.country === 'string' && body.country.trim() ? body.country.trim() : null
    const placeName = typeof body?.placeName === 'string' ? body.placeName.trim() : ''
    const fullAddress =
      typeof body?.fullAddress === 'string' && body.fullAddress.trim()
        ? body.fullAddress.trim()
        : null
    const latitude = typeof body?.latitude === 'number' && Number.isFinite(body.latitude)
      ? body.latitude
      : null
    const longitude = typeof body?.longitude === 'number' && Number.isFinite(body.longitude)
      ? body.longitude
      : null
    const province =
      typeof body?.province === 'string' && body.province.trim() ? body.province.trim() : null
    const street =
      typeof body?.street === 'string' && body.street.trim() ? body.street.trim() : null
    const typeOfPlace = Array.isArray(body?.typeOfPlace)
      ? body.typeOfPlace
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
      : []
    const tags = Array.isArray(body?.tags)
      ? body.tags
          .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
          .filter(Boolean)
      : []
      const zipCode =
        typeof body?.zipCode === 'string' && body.zipCode.trim() ? body.zipCode.trim() : null

    if (!placeName) {
      return NextResponse.json({ error: 'Missing place name.' }, { status: 400 })
    }

    const photo = await updateAlbumPhotoTags({
      city,
      country,
      id,
      fullAddress,
      latitude,
      longitude,
      placeName,
      province,
      street,
      tags,
      typeOfPlace,
      zipCode,
    })

    return NextResponse.json({ photo })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to update the photo right now.',
      },
      { status: 500 },
    )
  }
}