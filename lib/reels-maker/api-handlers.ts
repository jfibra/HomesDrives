import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

import { deleteReelJob, getReelJob, listReelDraftSummaries, updateReelJob } from '@/lib/reels-maker/job-store'
import {
  attachReelJobLogo,
  attachReelJobMedia,
  attachReelJobMusic,
  runReelJobPipeline,
  startReelJob,
} from '@/lib/reels-maker/pipeline'
import { parseReelResultStorage } from '@/lib/reels-maker/reel-playback'
import { uploadReelLogoFile, uploadReelMediaFile, uploadReelMusicFile } from '@/lib/reels-maker/storage'
import type { CreateReelJobInput, ReelLogoPosition, ReelTemplateId } from '@/lib/reels-maker/types'
import { getYouTubeTrackPreview, downloadYouTubeAudio } from '@/lib/reels-maker/youtube-music'
import { isValidYouTubeMusicUrl } from '@/lib/reels-maker/youtube-url'
import { createStorageClient } from '@/lib/server/albums'

const TEMPLATE_IDS: ReelTemplateId[] = [
  'cinematic',
  'luxury',
  'modern',
  'real-estate',
  'travel',
  'family',
  'event',
  'birthday',
  'wedding',
  'minimal',
  'social-trend',
]

const LOGO_POSITIONS: ReelLogoPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

function isTemplateId(value: string): value is ReelTemplateId {
  return TEMPLATE_IDS.includes(value as ReelTemplateId)
}

function parseLogoPosition(value: string): ReelLogoPosition {
  return LOGO_POSITIONS.includes(value as ReelLogoPosition) ? (value as ReelLogoPosition) : 'top-right'
}

function toWebStream(body: unknown) {
  if (
    body &&
    typeof body === 'object' &&
    'transformToWebStream' in body &&
    typeof (body as { transformToWebStream: () => ReadableStream }).transformToWebStream === 'function'
  ) {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream()
  }

  return Readable.toWeb(body as Readable) as ReadableStream
}

export async function handleReelJobsGet(): Promise<Response> {
  try {
    const drafts = listReelDraftSummaries()
    return Response.json({ drafts })
  } catch (error) {
    console.error('[reels-maker/jobs GET]', error)
    return Response.json({ error: 'Unable to load reel drafts.' }, { status: 500 })
  }
}

export async function handleReelJobsPost(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<CreateReelJobInput>
    const templateId = body.templateId ?? 'cinematic'
    if (!isTemplateId(templateId)) {
      return Response.json({ error: 'Invalid template.' }, { status: 400 })
    }

    const job = startReelJob({
      templateId,
      voiceOverEnabled: Boolean(body.voiceOverEnabled),
      outroEnabled: body.outroEnabled !== false,
      outroLine: body.outroLine,
      reelBrief: body.reelBrief,
      customCaption: body.customCaption,
    })

    return Response.json({ job })
  } catch (error) {
    console.error('[reels-maker/jobs POST]', error)
    return Response.json({ error: 'Unable to create reel job.' }, { status: 500 })
  }
}

export async function handleReelJobGet(jobId: string): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found.' }, { status: 404 })
  }
  return Response.json(
    { job },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  )
}

export async function handleReelJobDelete(jobId: string): Promise<Response> {
  const deleted = deleteReelJob(jobId)
  if (!deleted) {
    return Response.json({ error: 'Draft not found.' }, { status: 404 })
  }
  return Response.json({ deleted: true })
}

export async function handleReelJobUpload(jobId: string, request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found.' }, { status: 404 })
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
        return Response.json({ error: 'Invalid YouTube music link.' }, { status: 400 })
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
        return Response.json({
          job: jobAfterUpload,
          uploadedMedia,
          warning: `${message} Your photos were uploaded — the reel will render without background music unless you upload an MP3.`,
        })
      }
    }

    if (logoFile instanceof File && logoFile.size > 0) {
      if (!logoFile.type.startsWith('image/')) {
        return Response.json({ error: 'Logo must be a PNG, JPG, or WEBP image.' }, { status: 400 })
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

    return Response.json({ job: jobAfterUpload, uploadedMedia })
  } catch (error) {
    console.error('[reels-maker/upload]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Upload failed.' },
      { status: 500 },
    )
  }
}

export async function handleReelJobRender(jobId: string, request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found.' }, { status: 404 })
  }

  if (!job.media.length) {
    return Response.json({ error: 'Upload at least one photo or video first.' }, { status: 400 })
  }

  if (job.status !== 'queued' && job.status !== 'uploading' && job.status !== 'failed') {
    return Response.json({ error: 'This job is already processing or completed.' }, { status: 409 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      caption?: string
      reelBrief?: string
      voiceOverEnabled?: boolean
      outroEnabled?: boolean
      outroLine?: string
      templateId?: string
    }
    if (
      body.caption !== undefined ||
      body.reelBrief !== undefined ||
      body.voiceOverEnabled !== undefined ||
      body.outroEnabled !== undefined ||
      body.outroLine !== undefined ||
      body.templateId
    ) {
      updateReelJob(jobId, {
        caption: body.caption ?? job.caption,
        reelBrief: body.reelBrief ?? job.reelBrief,
        voiceOverEnabled: body.voiceOverEnabled ?? job.voiceOverEnabled,
        outroEnabled: body.outroEnabled ?? job.outroEnabled ?? true,
        outroLine: body.outroLine ?? job.outroLine ?? '',
        templateId: (body.templateId as typeof job.templateId) ?? job.templateId,
        status: 'queued',
        error: null,
        progress: Math.max(job.progress, 38),
        message: 'Starting generation…',
      })
    }
  } catch {
    // non-fatal
  }

  runReelJobPipeline(jobId)
  return Response.json({ jobId, started: true })
}

export async function handleReelJobVideo(jobId: string, request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job?.resultUrl) {
    return Response.json({ error: 'Reel video not found.' }, { status: 404 })
  }

  const location = parseReelResultStorage(job.resultUrl)
  if (!location) {
    return Response.json({ error: 'Unable to resolve reel storage location.' }, { status: 500 })
  }

  const range = request.headers.get('range') ?? undefined

  try {
    const storageClient = createStorageClient()
    const object = await storageClient.send(
      new GetObjectCommand({
        Bucket: location.bucketName,
        Key: location.storagePath,
        Range: range,
      }),
    )

    if (!object.Body) {
      return Response.json({ error: 'Empty video object.' }, { status: 502 })
    }

    const headers = new Headers({
      'Content-Type': object.ContentType || 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    })

    if (object.ContentLength != null) {
      headers.set('Content-Length', String(object.ContentLength))
    }
    if (object.ContentRange) {
      headers.set('Content-Range', object.ContentRange)
    }

    return new Response(toWebStream(object.Body), {
      status: range && object.ContentRange ? 206 : 200,
      headers,
    })
  } catch (error) {
    console.error('[reels-maker/jobs/video]', error)
    return Response.json({ error: 'Unable to stream reel video.' }, { status: 502 })
  }
}

export async function handleYouTubePreview(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { url?: string }
    const url = body.url?.trim() ?? ''
    if (!url || !isValidYouTubeMusicUrl(url)) {
      return Response.json({ error: 'Paste a valid YouTube music link.' }, { status: 400 })
    }

    const preview = await getYouTubeTrackPreview(url)
    return Response.json({ preview })
  } catch (error) {
    console.error('[reels-maker/youtube/preview]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to load YouTube track.' },
      { status: 500 },
    )
  }
}
