import { NextResponse } from 'next/server'

import { createAlbumFolder, getUserByCode, listAlbumFoldersByUploader } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const uploaderName = searchParams.get('uploader')?.trim()
    const uploaderCode = searchParams.get('uploaderCode')?.trim()

    if (!uploaderName && !uploaderCode) {
      return NextResponse.json(
        { error: 'Missing uploader or uploaderCode query parameter.' },
        { status: 400 },
      )
    }

    const folders = await listAlbumFoldersByUploader({
      uploaderCode,
      uploaderName: uploaderName || '',
    })
    return NextResponse.json({ folders })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to load folders right now.',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const uploaderName =
      typeof body?.uploaderName === 'string' && body.uploaderName.trim()
        ? body.uploaderName.trim()
        : ''
    const uploaderCode =
      typeof body?.uploaderCode === 'string' && body.uploaderCode.trim()
        ? body.uploaderCode.trim()
        : ''
    const folderName =
      typeof body?.folderName === 'string' && body.folderName.trim() ? body.folderName.trim() : ''

    const fullAddress =
      typeof body?.fullAddress === 'string' && body.fullAddress.trim()
        ? body.fullAddress.trim()
        : null
    const street =
      typeof body?.street === 'string' && body.street.trim() ? body.street.trim() : null
    const city = typeof body?.city === 'string' && body.city.trim() ? body.city.trim() : null
    const province =
      typeof body?.province === 'string' && body.province.trim() ? body.province.trim() : null
    const zipCode =
      typeof body?.zipCode === 'string' && body.zipCode.trim() ? body.zipCode.trim() : null
    const country =
      typeof body?.country === 'string' && body.country.trim() ? body.country.trim() : null

    const latitude =
      typeof body?.latitude === 'number' && Number.isFinite(body.latitude) ? body.latitude : null
    const longitude =
      typeof body?.longitude === 'number' && Number.isFinite(body.longitude) ? body.longitude : null

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

    if (!uploaderName || !uploaderCode || !folderName) {
      return NextResponse.json(
        { error: 'Missing required fields uploaderName, uploaderCode, or folderName.' },
        { status: 400 },
      )
    }

    const user = await getUserByCode(uploaderCode)
    if (!user) {
      return NextResponse.json({ error: 'Invalid uploader code.' }, { status: 404 })
    }

    if (user.full_name !== uploaderName) {
      return NextResponse.json({ error: 'Uploader name does not match uploader code.' }, { status: 403 })
    }

    const folder = await createAlbumFolder({
      albumUserId: user.id,
      uploaderName,
      uploaderCode,
      folderName,
      fullAddress,
      street,
      city,
      province,
      zipCode,
      country,
      latitude,
      longitude,
      typeOfPlace,
      tags,
    })

    return NextResponse.json({ folder }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Unable to create folder right now.',
      },
      { status: 500 },
    )
  }
}
