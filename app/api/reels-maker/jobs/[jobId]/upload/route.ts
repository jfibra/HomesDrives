import { NextResponse } from 'next/server'

import { getReelJob } from '@/lib/reels-maker/job-store'
import { attachReelJobLogo, attachReelJobMedia, attachReelJobMusic } from '@/lib/reels-maker/pipeline'
import { uploadReelLogoFile, uploadReelMediaFile, uploadReelMusicFile } from '@/lib/reels-maker/storage'
import { downloadYouTubeAudio } from '@/lib/reels-maker/youtube-music'
import { isValidYouTubeMusicUrl } from '@/lib/reels-maker/youtube-url'
import type { ReelLogoPosition } from '@/lib/reels-maker/types'

const LOGO_POSITIONS: ReelLogoPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

function parseLogoPosition(value: string): ReelLogoPosition {
  return LOGO_POSITIONS.includes(value as ReelLogoPosition) ? (value as ReelLogoPosition) : 'top-right'
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = {
  params: Promise<{ jobId: string }>
}

export async function POST(request: Request, context: RouteContext) {
  const { jobId } = await context.params
  const job = getReelJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File)
    const musicFile = formData.get('music')
    const logoFile = formData.get('logo')
    const logoEnabled = String(formData.get('logoEnabled') ?? 'false') === 'true'
    const logoPosition = parseLogoPosition(String(formData.get('logoPosition') ?? 'top-right'))
    const youtubeMusicUrl = String(formData.get('youtubeMusicUrl') ?? '').trim()
    const mediaNotesRaw = String(formData.get('mediaNotes') ?? '').trim()
    let mediaNotes: string[] = []
    if (mediaNotesRaw) {
      try {
        const parsed = JSON.parse(mediaNotesRaw)
        if (Array.isArray(parsed)) {
          mediaNotes = parsed.map((note) => String(note ?? '').trim())
        }
      } catch {
        // ignore invalid notes payload
      }
    }

    const uploadedMedia = await Promise.all(
      files.map(async (file, index) => {
        const buffer = Buffer.from(await file.arrayBuffer())
        return uploadReelMediaFile({
          fileName: file.name,
          mimeType: file.type,
          buffer,
          userNote: mediaNotes[index] || undefined,
        })
      }),
    )

    let jobAfterUpload = job
    if (uploadedMedia.length) {
      const updated = attachReelJobMedia(jobId, uploadedMedia)
      if (updated) jobAfterUpload = updated
    }

    if (musicFile instanceof File) {
      const musicBuffer = Buffer.from(await musicFile.arrayBuffer())
      const music = await uploadReelMusicFile({
        fileName: musicFile.name,
        mimeType: musicFile.type,
        buffer: musicBuffer,
      })
      const updated = attachReelJobMusic(jobId, music.bucketName, music.storagePath)
      if (updated) jobAfterUpload = updated
    } else if (youtubeMusicUrl) {
      if (!isValidYouTubeMusicUrl(youtubeMusicUrl)) {
        return NextResponse.json({ error: 'Invalid YouTube music link.' }, { status: 400 })
      }
      try {
        const youtubeAudio = await downloadYouTubeAudio(youtubeMusicUrl)
        const music = await uploadReelMusicFile({
          fileName: youtubeAudio.fileName,
          mimeType: youtubeAudio.mimeType,
          buffer: youtubeAudio.buffer,
        })
        const updated = attachReelJobMusic(jobId, music.bucketName, music.storagePath)
        if (updated) jobAfterUpload = updated
      } catch (youtubeError) {
        console.error('[reels-maker/upload] YouTube music failed', youtubeError)
        const message =
          youtubeError instanceof Error
            ? youtubeError.message
            : 'YouTube music could not be downloaded.'
        return NextResponse.json({
          job: jobAfterUpload,
          uploadedMedia,
          warning: `${message} Your photos were uploaded — the reel will render without background music unless you upload an MP3.`,
        })
      }
    }

    if (logoFile instanceof File && logoFile.size > 0) {
      if (!logoFile.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Logo must be a PNG, JPG, or WEBP image.' }, { status: 400 })
      }
      const logoBuffer = Buffer.from(await logoFile.arrayBuffer())
      const logo = await uploadReelLogoFile({
        fileName: logoFile.name,
        mimeType: logoFile.type,
        buffer: logoBuffer,
      })
      const updated = attachReelJobLogo(jobId, logo, {
        enabled: logoEnabled,
        position: logoPosition,
      })
      if (updated) jobAfterUpload = updated
    }

    return NextResponse.json({ job: jobAfterUpload, uploadedMedia })
  } catch (error) {
    console.error('[reels-maker/upload]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 500 },
    )
  }
}
