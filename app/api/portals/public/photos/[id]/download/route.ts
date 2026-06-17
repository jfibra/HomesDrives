import { NextResponse } from 'next/server'

import { downloadPortalPhotoObject, getPortalPhotoForPublicDownload } from '@/lib/portals/storage'

export const runtime = 'nodejs'

function sanitizeDownloadFileName(input: string) {
  return (input || 'download').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'download'
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!id) return NextResponse.json({ error: 'Missing photo id.' }, { status: 400 })

    const photo = await getPortalPhotoForPublicDownload(id)
    const buffer = await downloadPortalPhotoObject({
      bucketName: photo.bucketName,
      storagePath: photo.storagePath,
    })
    const fileName = sanitizeDownloadFileName(photo.originalFileName)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': photo.contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to download file.'
    const status = /not found/i.test(message) ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
