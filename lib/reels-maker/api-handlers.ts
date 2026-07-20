import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'

import { deleteReelJob, getReelJob, listReelDraftSummaries, setReelJobStatus, updateReelJob } from '@/lib/reels-maker/job-store'
import {
  attachReelJobAgentHeadshot,
  attachReelJobAccentLogo,
  attachReelJobLogo,
  attachReelJobMedia,
  attachReelJobMusic,
  attachReelJobQr,
  normalizeListingTitleColor,
  runReelJobPipeline,
  startReelJob,
} from '@/lib/reels-maker/pipeline'
import { parseReelResultStorage } from '@/lib/reels-maker/reel-playback'
import { uploadReelAgentHeadshotFile, uploadReelLogoFile, uploadReelMediaFile, uploadReelMusicFile, uploadReelQrFile, createReelPresignedUpload, registerReelAgentHeadshotFromStorage, registerReelLogoFromStorage, registerReelQrFromStorage, registerReelMediaFromStorage } from '@/lib/reels-maker/storage'
import { storeMusicUploadChunk } from '@/lib/reels-maker/music-chunk-sessions'
import { normalizeReelAspectRatio } from '@/lib/reels-maker/aspect-ratio'
import { normalizeVoiceGender } from '@/lib/reels-maker/voice-over'
import type {
  CreateReelJobInput,
  ReelLogoPosition,
  ReelOverlayDisplay,
  ReelTemplateId,
  ReelVoiceGender,
} from '@/lib/reels-maker/types'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

import {
  downloadYouTubeAudio,
  getYouTubeTrackPreview,
  probeYtDlpBinary,
} from '@/lib/reels-maker/youtube-music'
import { isValidYouTubeMusicUrl } from '@/lib/reels-maker/youtube-url'
import { formatApiError } from '@/lib/reels-maker/api-errors'
import { MAX_PHOTO_UPLOAD_BYTES, MAX_REEL_MUSIC_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_BYTES } from '@/lib/photo-upload-limits'
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
  'listing-showcase',
]

const LOGO_POSITIONS: ReelLogoPosition[] = [
  'top-left',
  'top-right',
  'top-center',
  'bottom-left',
  'bottom-right',
  'bottom-center',
]

const OVERLAY_DISPLAYS: ReelOverlayDisplay[] = ['always', 'photos-only', 'outro-only']

function isTemplateId(value: string): value is ReelTemplateId {
  return TEMPLATE_IDS.includes(value as ReelTemplateId)
}

function parseLogoPosition(value: string): ReelLogoPosition {
  return LOGO_POSITIONS.includes(value as ReelLogoPosition) ? (value as ReelLogoPosition) : 'top-right'
}

function parseQrPosition(value: string): ReelLogoPosition {
  return LOGO_POSITIONS.includes(value as ReelLogoPosition) ? (value as ReelLogoPosition) : 'bottom-right'
}

function parseOverlayDisplay(value: string, fallback: ReelOverlayDisplay = 'always'): ReelOverlayDisplay {
  const raw = value.trim().toLowerCase()
  // Aliases partners already send
  if (raw === 'photos' || raw === 'photo-only' || raw === 'tour-only') return 'photos-only'
  return OVERLAY_DISPLAYS.includes(raw as ReelOverlayDisplay)
    ? (raw as ReelOverlayDisplay)
    : fallback
}

function parseBoolish(value: FormDataEntryValue | null | undefined): boolean | null {
  if (value == null) return null
  const raw = String(value).trim().toLowerCase()
  if (!raw) return null
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'off'].includes(raw)) return false
  return null
}

/** Prefer photos-only when partners ask to skip watermark on the branded outro. */
function resolveLogoDisplay(params: {
  logoDisplay: ReelOverlayDisplay
  skipOutroWatermark?: boolean | null
  logoApplyToOutro?: boolean | null
}): ReelOverlayDisplay {
  if (params.skipOutroWatermark === true || params.logoApplyToOutro === false) {
    if (params.logoDisplay === 'outro-only') return 'outro-only'
    return 'photos-only'
  }
  return params.logoDisplay
}

/** captionsEnabled / subtitlesEnabled — either false turns burn-in off; default on. */
function resolveCaptionsEnabled(body: {
  captionsEnabled?: boolean
  subtitlesEnabled?: boolean
}): boolean {
  if (body.captionsEnabled === false || body.subtitlesEnabled === false) return false
  return true
}

async function readUploadedBlob(
  entry: FormDataEntryValue | null,
  fallbackName: string,
  fallbackMimeType: string,
) {
  if (!entry) return null

  const blob =
    entry instanceof File ? entry : entry instanceof Blob && entry.size > 0 ? entry : null

  if (!blob || blob.size === 0) return null

  const fileName =
    entry instanceof File && entry.name.trim() ? entry.name.trim() : fallbackName
  const mimeType = blob.type?.trim() || fallbackMimeType
  const buffer = Buffer.from(await blob.arrayBuffer())

  return { fileName, mimeType, buffer }
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
      aspectRatio: normalizeReelAspectRatio(body.aspectRatio),
      outputFormat: body.outputFormat,
      cameraMotion: body.cameraMotion,
      voiceOverEnabled: Boolean(body.voiceOverEnabled),
      voiceGender: normalizeVoiceGender(body.voiceGender) as ReelVoiceGender,
      captionsEnabled: resolveCaptionsEnabled(body),
      subtitlesEnabled: body.subtitlesEnabled,
      outroEnabled: body.outroEnabled !== false,
      outroLine: body.outroLine,
      reelBrief: body.reelBrief,
      customCaption: body.customCaption,
      listingTitle: body.listingTitle,
      listingTitleColor: body.listingTitleColor,
      listingDetails: body.listingDetails,
      listingPrice: body.listingPrice,
      listingAddress: body.listingAddress,
      listingBeds: body.listingBeds,
      listingBaths: body.listingBaths,
      listingSqft: body.listingSqft,
      listingUrl: body.listingUrl,
      agentName: body.agentName,
      agentPhone: body.agentPhone,
      agentEmail: body.agentEmail,
      agentAgencyName: body.agentAgencyName,
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
    const files = (
      await Promise.all(
        formData
          .getAll('files')
          .map((entry, index) =>
            readUploadedBlob(entry, `media-${index + 1}`, 'application/octet-stream'),
          ),
      )
    ).filter((file): file is NonNullable<typeof file> => Boolean(file))
    const musicUpload = await readUploadedBlob(formData.get('music'), 'music.mp3', 'audio/mpeg')
    const logoUpload = await readUploadedBlob(formData.get('logo'), 'logo.png', 'image/png')
    const logoEnabled = String(formData.get('logoEnabled') ?? 'false') === 'true'
    const logoPosition = parseLogoPosition(String(formData.get('logoPosition') ?? 'top-right'))
    const logoDisplay = resolveLogoDisplay({
      logoDisplay: parseOverlayDisplay(String(formData.get('logoDisplay') ?? 'always')),
      skipOutroWatermark: parseBoolish(formData.get('skipOutroWatermark')),
      logoApplyToOutro: parseBoolish(formData.get('logoApplyToOutro')),
    })
    const accentLogoUpload = await readUploadedBlob(formData.get('accentLogo'), 'accent-logo.png', 'image/png')
    const accentLogoEnabled = String(formData.get('accentLogoEnabled') ?? (accentLogoUpload ? 'true' : 'false')) === 'true'
    const qrUpload = await readUploadedBlob(formData.get('qr'), 'qr.png', 'image/png')
    const qrEnabled = String(formData.get('qrEnabled') ?? 'false') === 'true'
    const qrPosition = parseQrPosition(String(formData.get('qrPosition') ?? 'bottom-right'))
    const qrDisplay = parseOverlayDisplay(String(formData.get('qrDisplay') ?? 'always'))
    const agentHeadshotUpload = await readUploadedBlob(
      formData.get('agentHeadshot'),
      'agent-headshot.jpg',
      'image/jpeg',
    )
    const agentHeadshotEnabled = String(formData.get('agentHeadshotEnabled') ?? 'false') === 'true'
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
        return uploadReelMediaFile({
          fileName: file.fileName,
          mimeType: file.mimeType,
          buffer: file.buffer,
          userNote: mediaNotes[index] || undefined,
        })
      }),
    )

    let jobAfterUpload = job
    if (uploadedMedia.length) {
      const updated = attachReelJobMedia(jobId, uploadedMedia)
      if (updated) jobAfterUpload = updated
    }

    if (musicUpload) {
      const music = await uploadReelMusicFile({
        fileName: musicUpload.fileName,
        mimeType: musicUpload.mimeType,
        buffer: musicUpload.buffer,
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

    if (logoUpload) {
      if (!logoUpload.mimeType.startsWith('image/')) {
        return Response.json({ error: 'Logo must be a PNG, JPG, or WEBP image.' }, { status: 400 })
      }
      const logo = await uploadReelLogoFile({
        fileName: logoUpload.fileName,
        mimeType: logoUpload.mimeType,
        buffer: logoUpload.buffer,
      })
      const updated = attachReelJobLogo(jobId, logo, {
        enabled: logoEnabled,
        position: logoPosition,
        display: logoDisplay,
      })
      if (updated) jobAfterUpload = updated
    }

    if (accentLogoUpload) {
      if (!accentLogoUpload.mimeType.startsWith('image/')) {
        return Response.json({ error: 'Accent logo must be a PNG, JPG, or WEBP image.' }, { status: 400 })
      }
      const accent = await uploadReelLogoFile({
        fileName: accentLogoUpload.fileName,
        mimeType: accentLogoUpload.mimeType,
        buffer: accentLogoUpload.buffer,
      })
      const updated = attachReelJobAccentLogo(jobId, accent, {
        enabled: accentLogoEnabled,
      })
      if (updated) jobAfterUpload = updated
    }

    if (qrUpload) {
      if (!qrUpload.mimeType.startsWith('image/')) {
        return Response.json({ error: 'QR code must be a PNG, JPG, or WEBP image.' }, { status: 400 })
      }
      const qr = await uploadReelQrFile({
        fileName: qrUpload.fileName,
        mimeType: qrUpload.mimeType,
        buffer: qrUpload.buffer,
      })
      const updated = attachReelJobQr(jobId, qr, {
        enabled: qrEnabled,
        position: qrPosition,
        display: qrDisplay,
      })
      if (updated) jobAfterUpload = updated
    }

    if (agentHeadshotUpload) {
      if (!agentHeadshotUpload.mimeType.startsWith('image/')) {
        return Response.json({ error: 'Agent headshot must be a PNG, JPG, or WEBP image.' }, { status: 400 })
      }
      const headshot = await uploadReelAgentHeadshotFile({
        fileName: agentHeadshotUpload.fileName,
        mimeType: agentHeadshotUpload.mimeType,
        buffer: agentHeadshotUpload.buffer,
      })
      const updated = attachReelJobAgentHeadshot(jobId, headshot, {
        enabled: agentHeadshotEnabled,
      })
      if (updated) jobAfterUpload = updated
    }

    return Response.json({ job: jobAfterUpload, uploadedMedia })
  } catch (error) {
    console.error('[reels-maker/upload]', error)
    return Response.json(
      { error: formatApiError(error, 'Upload failed.') },
      { status: 500 },
    )
  }
}

function maxBytesForReelRole(role: string, mimeType: string) {
  if (role === 'music') return MAX_REEL_MUSIC_UPLOAD_BYTES
  if (mimeType.startsWith('video/')) return MAX_VIDEO_UPLOAD_BYTES
  return MAX_PHOTO_UPLOAD_BYTES
}

export async function handleReelJobUploadPresign(jobId: string, request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const body = (await request.json()) as {
      files?: Array<{
        clientId?: string
        fileName?: string
        contentType?: string
        size?: number
        role?: 'media' | 'music' | 'logo' | 'accentLogo' | 'qr' | 'agentHeadshot'
      }>
    }

    const files = body.files ?? []
    if (!files.length) {
      return Response.json({ error: 'No files requested for upload.' }, { status: 400 })
    }

    const uploads = []
    for (const file of files) {
      const clientId = file.clientId?.trim()
      const fileName = file.fileName?.trim()
      const role = file.role
      const contentType = file.contentType?.trim() || 'application/octet-stream'
      const size = Number(file.size ?? 0)

      if (!clientId || !fileName || !role) {
        return Response.json({ error: 'Invalid presign request.' }, { status: 400 })
      }

      const maxBytes = maxBytesForReelRole(role, contentType)
      if (size <= 0 || size > maxBytes) {
        return Response.json({ error: `"${fileName}" exceeds the upload size limit.` }, { status: 400 })
      }

      const presigned = await createReelPresignedUpload({ fileName, contentType })
      uploads.push({
        clientId,
        role,
        uploadUrl: presigned.uploadUrl,
        bucketName: presigned.bucketName,
        storagePath: presigned.storagePath,
        contentType: presigned.contentType,
      })
    }

    return Response.json({ uploads })
  } catch (error) {
    console.error('[reels-maker/upload/presign]', error)
    return Response.json(
      { error: formatApiError(error, 'Unable to prepare uploads.') },
      { status: 500 },
    )
  }
}

export async function handleReelJobUploadFinalize(jobId: string, request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const body = (await request.json()) as {
      uploads?: Array<{
        role?: 'media' | 'music' | 'logo' | 'accentLogo' | 'qr' | 'agentHeadshot'
        fileName?: string
        mimeType?: string
        bucketName?: string
        storagePath?: string
        userNote?: string
      }>
      logoEnabled?: boolean
      logoPosition?: string
      logoDisplay?: string
      skipOutroWatermark?: boolean | string
      logoApplyToOutro?: boolean | string
      accentLogoEnabled?: boolean
      qrEnabled?: boolean
      qrPosition?: string
      qrDisplay?: string
      agentHeadshotEnabled?: boolean
    }

    const logoEnabled = body.logoEnabled === true
    const logoPosition = parseLogoPosition(String(body.logoPosition ?? 'top-right'))
    const logoDisplay = resolveLogoDisplay({
      logoDisplay: parseOverlayDisplay(String(body.logoDisplay ?? 'always')),
      skipOutroWatermark:
        typeof body.skipOutroWatermark === 'boolean'
          ? body.skipOutroWatermark
          : parseBoolish(body.skipOutroWatermark ?? null),
      logoApplyToOutro:
        typeof body.logoApplyToOutro === 'boolean'
          ? body.logoApplyToOutro
          : parseBoolish(body.logoApplyToOutro ?? null),
    })
    const accentLogoEnabled = body.accentLogoEnabled !== false
    const qrEnabled = body.qrEnabled === true
    const qrPosition = parseQrPosition(String(body.qrPosition ?? 'bottom-right'))
    const qrDisplay = parseOverlayDisplay(String(body.qrDisplay ?? 'always'))
    const agentHeadshotEnabled = body.agentHeadshotEnabled === true
    const uploads = body.uploads ?? []

    let jobAfterUpload = job
    const uploadedMedia = []

    for (const upload of uploads) {
      const role = upload.role
      const fileName = upload.fileName?.trim()
      const mimeType = upload.mimeType?.trim() || 'application/octet-stream'
      const bucketName = upload.bucketName?.trim()
      const storagePath = upload.storagePath?.trim()

      if (!role || !fileName || !bucketName || !storagePath) {
        return Response.json({ error: 'Invalid finalize upload payload.' }, { status: 400 })
      }

      if (role === 'media') {
        const media = await registerReelMediaFromStorage({
          fileName,
          mimeType,
          bucketName,
          storagePath,
          userNote: upload.userNote,
        })
        uploadedMedia.push(media)
        continue
      }

      if (role === 'music') {
        const updated = attachReelJobMusic(jobId, bucketName, storagePath)
        if (updated) jobAfterUpload = updated
        continue
      }

      if (role === 'logo') {
        if (!mimeType.startsWith('image/')) {
          return Response.json({ error: 'Logo must be a PNG, JPG, or WEBP image.' }, { status: 400 })
        }
        const logo = await registerReelLogoFromStorage({
          fileName,
          mimeType,
          bucketName,
          storagePath,
        })
        const updated = attachReelJobLogo(jobId, logo, {
          enabled: logoEnabled,
          position: logoPosition,
          display: logoDisplay,
        })
        if (updated) jobAfterUpload = updated
        continue
      }

      if (role === 'accentLogo') {
        if (!mimeType.startsWith('image/')) {
          return Response.json({ error: 'Accent logo must be a PNG, JPG, or WEBP image.' }, { status: 400 })
        }
        const accent = await registerReelLogoFromStorage({
          fileName,
          mimeType,
          bucketName,
          storagePath,
        })
        const updated = attachReelJobAccentLogo(jobId, accent, { enabled: accentLogoEnabled })
        if (updated) jobAfterUpload = updated
        continue
      }

      if (role === 'qr') {
        if (!mimeType.startsWith('image/')) {
          return Response.json({ error: 'QR code must be a PNG, JPG, or WEBP image.' }, { status: 400 })
        }
        const qr = await registerReelQrFromStorage({
          fileName,
          mimeType,
          bucketName,
          storagePath,
        })
        const updated = attachReelJobQr(jobId, qr, {
          enabled: qrEnabled,
          position: qrPosition,
          display: qrDisplay,
        })
        if (updated) jobAfterUpload = updated
        continue
      }

      if (role === 'agentHeadshot') {
        if (!mimeType.startsWith('image/')) {
          return Response.json({ error: 'Agent headshot must be a PNG, JPG, or WEBP image.' }, { status: 400 })
        }
        const headshot = await registerReelAgentHeadshotFromStorage({
          fileName,
          mimeType,
          bucketName,
          storagePath,
        })
        const updated = attachReelJobAgentHeadshot(jobId, headshot, {
          enabled: agentHeadshotEnabled,
        })
        if (updated) jobAfterUpload = updated
      }
    }

    if (uploadedMedia.length) {
      const updated = attachReelJobMedia(jobId, uploadedMedia)
      if (updated) jobAfterUpload = updated
    }

    return Response.json({ job: jobAfterUpload, uploadedMedia })
  } catch (error) {
    console.error('[reels-maker/upload/finalize]', error)
    return Response.json(
      { error: formatApiError(error, 'Upload failed.') },
      { status: 500 },
    )
  }
}

export async function handleReelJobMusicChunkUpload(jobId: string, request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job) {
    return Response.json({ error: 'Job not found.' }, { status: 404 })
  }

  try {
    const formData = await request.formData()
    const uploadId = String(formData.get('uploadId') ?? '').trim()
    const chunkIndex = Number.parseInt(String(formData.get('chunkIndex') ?? ''), 10)
    const totalChunks = Number.parseInt(String(formData.get('totalChunks') ?? ''), 10)
    const fileName = String(formData.get('fileName') ?? 'music.mp3').trim() || 'music.mp3'
    const mimeType = String(formData.get('mimeType') ?? 'audio/mpeg').trim() || 'audio/mpeg'
    const chunkUpload = await readUploadedBlob(formData.get('chunk'), fileName, mimeType)

    if (!uploadId || !chunkUpload) {
      return Response.json({ error: 'Invalid music chunk upload.' }, { status: 400 })
    }

    const result = await storeMusicUploadChunk({
      uploadId,
      chunkIndex,
      totalChunks,
      fileName,
      mimeType,
      chunk: chunkUpload.buffer,
    })

    if (!result.complete) {
      return Response.json({
        received: result.received,
        totalChunks: result.totalChunks,
      })
    }

    if (result.buffer.length > MAX_REEL_MUSIC_UPLOAD_BYTES) {
      return Response.json({ error: 'Music file is too large. Maximum size is 50 MB.' }, { status: 400 })
    }

    const music = await uploadReelMusicFile({
      fileName: result.fileName,
      mimeType: result.mimeType,
      buffer: result.buffer,
    })
    const updated = attachReelJobMusic(jobId, music.bucketName, music.storagePath)
    if (!updated) {
      return Response.json({ error: 'Job not found.' }, { status: 404 })
    }

    return Response.json({ job: updated })
  } catch (error) {
    console.error('[reels-maker/upload/music-chunk]', error)
    return Response.json(
      { error: formatApiError(error, 'Music upload failed.') },
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
    const updatedMs = new Date(job.updatedAt).getTime()
    const staleRender =
      (job.status === 'rendering' || job.status === 'creating_voiceover') &&
      Number.isFinite(updatedMs) &&
      Date.now() - updatedMs > 12 * 60 * 1000

    if (staleRender) {
      setReelJobStatus(jobId, 'failed', 'Rendering timed out', 100, {
        error: 'Render stalled with no progress and was marked failed. Please retry.',
      })
    } else {
      return Response.json({ error: 'This job is already processing or completed.' }, { status: 409 })
    }
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      caption?: string
      reelBrief?: string
      voiceOverEnabled?: boolean
      voiceGender?: string
      captionsEnabled?: boolean
      subtitlesEnabled?: boolean
      outroEnabled?: boolean
      outroLine?: string
      templateId?: string
      aspectRatio?: string
      outputFormat?: string
      cameraMotion?: string
      listingTitle?: string
      listingTitleColor?: string
      listingDetails?: string
      agentName?: string
      agentPhone?: string
      agentEmail?: string
      agentAgencyName?: string
    }
    if (
      body.caption !== undefined ||
      body.reelBrief !== undefined ||
      body.voiceOverEnabled !== undefined ||
      body.voiceGender !== undefined ||
      body.captionsEnabled !== undefined ||
      body.subtitlesEnabled !== undefined ||
      body.outroEnabled !== undefined ||
      body.outroLine !== undefined ||
      body.templateId ||
      body.aspectRatio ||
      body.outputFormat ||
      body.cameraMotion ||
      body.listingTitle !== undefined ||
      body.listingTitleColor !== undefined ||
      body.listingDetails !== undefined ||
      body.agentName !== undefined ||
      body.agentPhone !== undefined ||
      body.agentEmail !== undefined ||
      body.agentAgencyName !== undefined
    ) {
      const captionsPatch =
        body.captionsEnabled !== undefined || body.subtitlesEnabled !== undefined
          ? { captionsEnabled: resolveCaptionsEnabled(body) }
          : {}
      const outputFormat =
        body.outputFormat != null
          ? String(body.outputFormat).toLowerCase() === 'youtube'
            ? ('youtube' as const)
            : ('reels' as const)
          : job.outputFormat || 'reels'
      const cameraRaw = String(body.cameraMotion ?? job.cameraMotion ?? '')
        .trim()
        .toLowerCase()
      const cameraMotion =
        cameraRaw === 'off' || cameraRaw === 'none' || cameraRaw === 'static'
          ? ('off' as const)
          : cameraRaw === 'subtle' || cameraRaw === 'light' || cameraRaw === 'minimal'
            ? ('subtle' as const)
            : cameraRaw === 'cinematic' || cameraRaw === 'full'
              ? ('cinematic' as const)
              : outputFormat === 'youtube'
                ? ('subtle' as const)
                : ('cinematic' as const)
      updateReelJob(jobId, {
        caption: body.caption ?? job.caption,
        reelBrief: body.reelBrief ?? job.reelBrief,
        voiceOverEnabled: body.voiceOverEnabled ?? job.voiceOverEnabled,
        voiceGender:
          body.voiceGender !== undefined
            ? (normalizeVoiceGender(body.voiceGender) as ReelVoiceGender)
            : job.voiceGender || 'woman',
        ...captionsPatch,
        outroEnabled: body.outroEnabled ?? job.outroEnabled ?? true,
        outroLine: body.outroLine ?? job.outroLine ?? '',
        templateId: (body.templateId as typeof job.templateId) ?? job.templateId,
        aspectRatio:
          outputFormat === 'youtube'
            ? normalizeReelAspectRatio('landscape')
            : body.aspectRatio
              ? normalizeReelAspectRatio(body.aspectRatio)
              : job.aspectRatio,
        outputFormat,
        cameraMotion,
        listingTitle:
          body.listingTitle !== undefined ? String(body.listingTitle).trim() : job.listingTitle || '',
        listingTitleColor:
          body.listingTitleColor !== undefined
            ? normalizeListingTitleColor(body.listingTitleColor)
            : job.listingTitleColor || '',
        listingDetails:
          body.listingDetails !== undefined
            ? String(body.listingDetails).trim()
            : job.listingDetails || '',
        agentName: body.agentName !== undefined ? String(body.agentName).trim() : job.agentName,
        agentPhone: body.agentPhone !== undefined ? String(body.agentPhone).trim() : job.agentPhone,
        agentEmail: body.agentEmail !== undefined ? String(body.agentEmail).trim() : job.agentEmail,
        agentAgencyName:
          body.agentAgencyName !== undefined ? String(body.agentAgencyName).trim() : job.agentAgencyName,
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

/** YouTube outro still — download for use as the YouTube custom thumbnail. */
export async function handleReelJobThumbnail(jobId: string, _request: Request): Promise<Response> {
  const job = getReelJob(jobId)
  if (!job?.thumbnailUrl) {
    return Response.json({ error: 'Thumbnail not found. Available on completed YouTube jobs.' }, { status: 404 })
  }

  const location = parseReelResultStorage(job.thumbnailUrl)
  if (!location) {
    return Response.json({ error: 'Unable to resolve thumbnail storage location.' }, { status: 500 })
  }

  try {
    const storageClient = createStorageClient()
    const object = await storageClient.send(
      new GetObjectCommand({
        Bucket: location.bucketName,
        Key: location.storagePath,
      }),
    )

    if (!object.Body) {
      return Response.json({ error: 'Empty thumbnail object.' }, { status: 502 })
    }

    const contentType = object.ContentType || 'image/png'
    const ext = contentType.includes('jpeg') ? 'jpg' : 'png'
    const headers = new Headers({
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `attachment; filename="youtube-thumbnail-${jobId.slice(0, 8)}.${ext}"`,
    })
    if (object.ContentLength != null) {
      headers.set('Content-Length', String(object.ContentLength))
    }

    return new Response(toWebStream(object.Body), { status: 200, headers })
  } catch (error) {
    console.error('[reels-maker/jobs/thumbnail]', error)
    return Response.json({ error: 'Unable to download thumbnail.' }, { status: 502 })
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

export async function handleYouTubeStreamInfo(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { url?: string }
    const url = body.url?.trim() ?? ''
    if (!url || !isValidYouTubeMusicUrl(url)) {
      return Response.json({ error: 'Paste a valid YouTube music link.' }, { status: 400 })
    }

    const { resolveYouTubeStreamInfo } = await import('@/lib/reels-maker/youtube-stream-info')
    const stream = await resolveYouTubeStreamInfo(url)
    return Response.json({ stream })
  } catch (error) {
    console.error('[reels-maker/youtube/stream-info]', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Unable to resolve YouTube audio stream.' },
      { status: 500 },
    )
  }
}

const YOUTUBE_COOKIES_PATH = join(process.cwd(), '.data', 'youtube-cookies.txt')

export async function handleYouTubeCookiesUpload(request: Request): Promise<Response> {
  try {
    const text = (await request.text()).trim()
    if (!text) {
      return Response.json({ error: 'Paste Netscape-format cookies in the request body.' }, { status: 400 })
    }

    if (!/^# Netscape HTTP Cookie File/m.test(text) && !/\.youtube\.com\t/i.test(text)) {
      return Response.json(
        {
          error:
            'Invalid cookies file. Export youtube.com-only cookies using the "Get cookies.txt LOCALLY" browser extension.',
        },
        { status: 400 },
      )
    }

    if (!/\.youtube\.com\t/i.test(text)) {
      return Response.json({ error: 'No youtube.com cookies found. Export from youtube.com only.' }, { status: 400 })
    }

    await mkdir(join(process.cwd(), '.data'), { recursive: true })
    await writeFile(YOUTUBE_COOKIES_PATH, `${text}\n`, { mode: 0o600 })

    try {
      probeYtDlpBinary()
    } catch {
      // non-fatal
    }

    return Response.json({
      ok: true,
      path: YOUTUBE_COOKIES_PATH,
      message:
        'Cookies saved. On EC2: remove YT_DLP_SKIP_COOKIES from .env, set YT_DLP_COOKIES_FILE to this path, then pm2 restart reels-api --update-env',
    })
  } catch (error) {
    console.error('[reels-maker/youtube/cookies]', error)
    return Response.json({ error: 'Unable to save YouTube cookies.' }, { status: 500 })
  }
}
