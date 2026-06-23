import { NextResponse } from 'next/server'
import JSZip from 'jszip'

import { MAX_PHOTO_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
import { PUBLIC_PORTAL_CODE } from '@/lib/portals/constants'
import { requirePortalEventBySlug } from '@/lib/portals/events'
import { createPortalFolder, uploadPortalPhoto } from '@/lib/portals/storage'
import { inferPortalContentType } from '@/lib/portals/upload-file-utils'

export const runtime = 'nodejs'

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
])

function isImageFile(file: File) {
  if (file.type && IMAGE_TYPES.has(file.type.toLowerCase())) return true
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)
}

function isZipFile(file: File) {
  if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed') return true
  return /\.zip$/i.test(file.name)
}

async function extractImagesFromZip(file: File): Promise<File[]> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const zip = await JSZip.loadAsync(buffer)
  const images: File[] = []

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    if (!/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(path)) continue
    const blob = await entry.async('nodebuffer')
    if (blob.length > MAX_PHOTO_UPLOAD_BYTES) continue
    const fileName = path.split('/').pop() ?? path
    images.push(
      new File([blob], fileName, {
        type: inferPortalContentType(fileName, ''),
      }),
    )
  }

  return images
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const eventSlug =
      typeof formData.get('eventSlug') === 'string' ? String(formData.get('eventSlug')).trim() : ''
    const folderName =
      typeof formData.get('folderName') === 'string' ? formData.get('folderName')?.toString().trim() : ''
    const contactName =
      typeof formData.get('contactName') === 'string'
        ? formData.get('contactName')?.toString().trim() || 'Public visitor'
        : 'Public visitor'

    if (!eventSlug) {
      return NextResponse.json({ error: 'Missing eventSlug.' }, { status: 400 })
    }
    if (!folderName) {
      return NextResponse.json({ error: 'Folder name is required.' }, { status: 400 })
    }

    const rawFiles = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
    if (rawFiles.length === 0) {
      return NextResponse.json({ error: 'Please choose at least one photo or zip file.' }, { status: 400 })
    }

    const imageFiles: File[] = []
    for (const file of rawFiles) {
      if (isImageFile(file)) {
        if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: `${file.name} exceeds the ${MAX_PHOTO_UPLOAD_BYTES / (1024 * 1024)} MB limit.` },
            { status: 413 },
          )
        }
        imageFiles.push(file)
        continue
      }
      if (isZipFile(file)) {
        const extracted = await extractImagesFromZip(file)
        if (extracted.length === 0) {
          return NextResponse.json({ error: 'The zip file did not contain supported images.' }, { status: 400 })
        }
        imageFiles.push(...extracted)
        continue
      }
      return NextResponse.json({ error: `${file.name} is not a supported image or zip file.` }, { status: 400 })
    }

    const event = await requirePortalEventBySlug(eventSlug)
    const folder = await createPortalFolder({
      uploaderCode: PUBLIC_PORTAL_CODE,
      folderName,
      labelSuffix: contactName,
      eventId: event.id,
    })

    let uploadedCount = 0
    for (const file of imageFiles) {
      const buffer = Buffer.from(await file.arrayBuffer())
      await uploadPortalPhoto({
        folderId: folder.id,
        uploaderCode: PUBLIC_PORTAL_CODE,
        fileName: file.name,
        fileBuffer: buffer,
        contentType: inferPortalContentType(file.name, file.type || ''),
        eventId: event.id,
      })
      uploadedCount += 1
    }

    return NextResponse.json({
      success: true,
      uploadedCount,
      folderId: folder.id,
      folderName: folder.folder_name,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to upload right now.' },
      { status: 500 },
    )
  }
}
