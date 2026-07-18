import { randomUUID } from 'crypto'

import { generateReelStoryPlan } from '@/lib/reels-maker/gemini-story'
import { buildListingShowcasePlan } from '@/lib/reels-maker/listing-showcase-plan'
import { formatApiError } from '@/lib/reels-maker/api-errors'
import { generateVoiceOverAudio, resolveVoiceOutroLine, fitVoiceScriptToScenes, buildVoiceOverDisplayScript } from '@/lib/reels-maker/voice-over'
import { createReelJob, getReelJob, listReelJobs, setReelJobStatus, updateReelJob } from '@/lib/reels-maker/job-store'
import { selectBestMedia, uploadRenderedReel } from '@/lib/reels-maker/storage'
import { normalizeReelAspectRatio } from '@/lib/reels-maker/aspect-ratio'
import type {
  CreateReelJobInput,
  ReelJob,
  ReelLogoPosition,
  ReelOverlayDisplay,
  ReelUploadedMedia,
} from '@/lib/reels-maker/types'

function resolveCaptionsEnabled(input: {
  captionsEnabled?: boolean
  subtitlesEnabled?: boolean
}): boolean {
  if (input.captionsEnabled === false || input.subtitlesEnabled === false) return false
  return true
}

export function startReelJob(input: CreateReelJobInput): ReelJob {
  const now = new Date().toISOString()
  const job: ReelJob = {
    id: randomUUID(),
    status: 'queued',
    progress: 0,
    message: 'Waiting to start…',
    createdAt: now,
    updatedAt: now,
    templateId: input.templateId,
    aspectRatio: normalizeReelAspectRatio(input.aspectRatio),
    voiceOverEnabled: input.voiceOverEnabled,
    captionsEnabled: resolveCaptionsEnabled(input),
    outroEnabled: input.outroEnabled !== false,
    outroLine: input.outroLine?.trim() || '',
    reelBrief: input.reelBrief?.trim() || '',
    caption: input.customCaption?.trim() || '',
    hashtags: [],
    voiceOverScript: '',
    plan: null,
    media: [],
    musicBucketName: null,
    musicStoragePath: null,
    logoEnabled: false,
    logoBucketName: null,
    logoStoragePath: null,
    logoPublicUrl: null,
    logoPosition: 'top-right',
    logoDisplay: 'always',
    accentLogoEnabled: false,
    accentLogoBucketName: null,
    accentLogoStoragePath: null,
    accentLogoPublicUrl: null,
    qrEnabled: false,
    qrBucketName: null,
    qrStoragePath: null,
    qrPublicUrl: null,
    qrPosition: 'bottom-right',
    qrDisplay: 'always',
    agentHeadshotEnabled: false,
    agentHeadshotBucketName: null,
    agentHeadshotStoragePath: null,
    agentHeadshotPublicUrl: null,
    listingPrice: input.listingPrice?.trim() || '',
    listingAddress: input.listingAddress?.trim() || '',
    listingBeds: input.listingBeds?.trim() || '',
    listingBaths: input.listingBaths?.trim() || '',
    listingSqft: input.listingSqft?.trim() || '',
    listingUrl: input.listingUrl?.trim() || '',
    agentName: input.agentName?.trim() || '',
    agentPhone: input.agentPhone?.trim() || '',
    agentEmail: input.agentEmail?.trim() || '',
    agentAgencyName: input.agentAgencyName?.trim() || '',
    resultUrl: null,
    error: null,
  }
  return createReelJob(job)
}

export function attachReelJobMedia(jobId: string, media: ReelUploadedMedia[]) {
  const job = getReelJob(jobId)
  if (!job) return null
  return updateReelJob(jobId, {
    media: [...job.media, ...media],
    status: 'uploading',
    progress: Math.min(35, job.progress + 10),
    message: 'Uploading media…',
  })
}

export function attachReelJobMusic(jobId: string, bucketName: string, storagePath: string) {
  return updateReelJob(jobId, { musicBucketName: bucketName, musicStoragePath: storagePath })
}

export function attachReelJobLogo(
  jobId: string,
  logo: { bucketName: string; storagePath: string; publicUrl: string },
  options: { enabled: boolean; position: ReelLogoPosition; display?: ReelOverlayDisplay },
) {
  return updateReelJob(jobId, {
    logoEnabled: options.enabled,
    logoBucketName: logo.bucketName,
    logoStoragePath: logo.storagePath,
    logoPublicUrl: logo.publicUrl,
    logoPosition: options.position,
    logoDisplay: options.display ?? 'always',
  })
}

export function attachReelJobAccentLogo(
  jobId: string,
  logo: { bucketName: string; storagePath: string; publicUrl: string },
  options: { enabled: boolean },
) {
  return updateReelJob(jobId, {
    accentLogoEnabled: options.enabled,
    accentLogoBucketName: logo.bucketName,
    accentLogoStoragePath: logo.storagePath,
    accentLogoPublicUrl: logo.publicUrl,
  })
}

export function attachReelJobQr(
  jobId: string,
  qr: { bucketName: string; storagePath: string; publicUrl: string },
  options: { enabled: boolean; position: ReelLogoPosition; display?: ReelOverlayDisplay },
) {
  return updateReelJob(jobId, {
    qrEnabled: options.enabled,
    qrBucketName: qr.bucketName,
    qrStoragePath: qr.storagePath,
    qrPublicUrl: qr.publicUrl,
    qrPosition: options.position,
    qrDisplay: options.display ?? 'always',
  })
}

export function attachReelJobAgentHeadshot(
  jobId: string,
  headshot: { bucketName: string; storagePath: string; publicUrl: string },
  options: { enabled: boolean },
) {
  return updateReelJob(jobId, {
    agentHeadshotEnabled: options.enabled,
    agentHeadshotBucketName: headshot.bucketName,
    agentHeadshotStoragePath: headshot.storagePath,
    agentHeadshotPublicUrl: headshot.publicUrl,
  })
}

export function runReelJobPipeline(jobId: string) {
  void processReelJob(jobId)
}

/** Jobs stuck in rendering (hang / crash) otherwise stay at 78% forever. */
const STUCK_RENDER_MS = 12 * 60 * 1000

function failStuckRenderingJobs(exceptJobId: string) {
  const now = Date.now()
  for (const job of listReelJobs()) {
    if (job.id === exceptJobId) continue
    if (job.status !== 'rendering' && job.status !== 'creating_voiceover') continue
    const updated = new Date(job.updatedAt).getTime()
    if (!Number.isFinite(updated) || now - updated < STUCK_RENDER_MS) continue
    setReelJobStatus(job.id, 'failed', 'Rendering timed out', 100, {
      error: 'Render stalled with no progress and was marked failed. Please retry.',
    })
  }
}

async function processReelJob(jobId: string) {
  const job = getReelJob(jobId)
  if (!job) return

  try {
    failStuckRenderingJobs(jobId)
    setReelJobStatus(jobId, 'analyzing', 'Analyzing media…', 40)
    const selectedMedia = selectBestMedia(job.media)
    if (!selectedMedia.length) {
      throw new Error('No media was uploaded. Add at least one photo or video.')
    }

    updateReelJob(jobId, { media: selectedMedia })

    setReelJobStatus(jobId, 'generating_story', 'Generating story…', 55)
    let story =
      job.templateId === 'listing-showcase'
        ? buildListingShowcasePlan({ media: selectedMedia, job })
        : await generateReelStoryPlan({
            media: selectedMedia,
            templateId: job.templateId,
            voiceOverEnabled: job.voiceOverEnabled,
            reelBrief: job.reelBrief || undefined,
            customCaption: job.caption || undefined,
          })

    if (job.captionsEnabled === false) {
      story = {
        ...story,
        plan: {
          ...story.plan,
          scenes: story.plan.scenes.map((scene) => ({
            ...scene,
            captionLine: null,
          })),
        },
      }
    }

    const sceneCount = story.plan.scenes.length
    const outroLine = resolveVoiceOutroLine({
      customOutro: job.outroLine || undefined,
      reelBrief: job.reelBrief,
    })
    const mainScript = fitVoiceScriptToScenes(story.plan.voiceOverScript, sceneCount)
    const voiceScript = buildVoiceOverDisplayScript(mainScript, outroLine)

    setReelJobStatus(
      jobId,
      'writing_captions',
      job.captionsEnabled === false ? 'Preparing timeline…' : 'Writing captions…',
      65,
      {
        plan: story.plan,
        caption: story.caption,
        hashtags: story.hashtags,
        voiceOverScript: voiceScript,
      },
    )

    let voiceOverBuffer: Buffer | null = null

    if (job.voiceOverEnabled && (mainScript.trim() || job.outroEnabled !== false)) {
      setReelJobStatus(jobId, 'creating_voiceover', 'Creating voice-over…', 72, {
        voiceOverScript: voiceScript,
      })
      voiceOverBuffer = await generateVoiceOverAudio(mainScript, sceneCount, {
        outroLine: job.outroLine || undefined,
        reelBrief: job.reelBrief,
        includeOutro: job.outroEnabled !== false,
      })
      if (!voiceOverBuffer?.length) {
        console.warn('[reels-maker/pipeline] Voice-over generation returned no audio — continuing without narration.')
      }
    }

    setReelJobStatus(jobId, 'rendering', 'Rendering video…', 78)
    const music =
      job.musicBucketName && job.musicStoragePath
        ? { bucketName: job.musicBucketName, storagePath: job.musicStoragePath }
        : null

    const logo =
      job.logoEnabled && job.logoBucketName && job.logoStoragePath
        ? {
            bucketName: job.logoBucketName,
            storagePath: job.logoStoragePath,
            position: job.logoPosition ?? 'top-right',
            display: job.logoDisplay ?? 'always',
          }
        : null

    const accentLogo =
      job.accentLogoEnabled && job.accentLogoBucketName && job.accentLogoStoragePath
        ? { bucketName: job.accentLogoBucketName, storagePath: job.accentLogoStoragePath }
        : null

    const qr =
      job.qrEnabled && job.qrBucketName && job.qrStoragePath
        ? {
            bucketName: job.qrBucketName,
            storagePath: job.qrStoragePath,
            position: job.qrPosition ?? 'bottom-right',
            display: job.qrDisplay ?? 'always',
          }
        : null

    const agentHeadshot =
      job.agentHeadshotEnabled && job.agentHeadshotBucketName && job.agentHeadshotStoragePath
        ? { bucketName: job.agentHeadshotBucketName, storagePath: job.agentHeadshotStoragePath }
        : null

    const listing =
      job.templateId === 'listing-showcase'
        ? {
            price: job.listingPrice,
            address: job.listingAddress,
            beds: job.listingBeds,
            baths: job.listingBaths,
            sqft: job.listingSqft,
            listingUrl: job.listingUrl,
          }
        : null

    const agent =
      job.agentName?.trim() ||
      job.agentPhone?.trim() ||
      job.agentEmail?.trim() ||
      job.agentAgencyName?.trim()
        ? {
            name: job.agentName,
            phone: job.agentPhone,
            email: job.agentEmail,
            agencyName: job.agentAgencyName,
          }
        : null

    const { renderReelWithFfmpeg } = await import('@/lib/reels-maker/ffmpeg-render')
    const rendered = await renderReelWithFfmpeg({
      plan: story.plan,
      media: selectedMedia,
      aspectRatio: normalizeReelAspectRatio(job.aspectRatio),
      music,
      logo,
      accentLogo,
      qr,
      agentHeadshot,
      listing,
      agent,
      outroCtaText: job.outroLine || undefined,
      outroEnabled: job.outroEnabled !== false,
      voiceOver: voiceOverBuffer,
      onProgress: (message, progress) => {
        setReelJobStatus(jobId, 'rendering', message, progress)
      },
    })

    setReelJobStatus(jobId, 'uploading_result', 'Uploading final Reel…', 90)
    const resultUrl = await uploadRenderedReel(rendered)

    setReelJobStatus(jobId, 'completed', 'Completed', 100, {
      resultUrl,
      error: null,
    })
  } catch (error) {
    console.error('[reels-maker/pipeline]', jobId, error)
    setReelJobStatus(jobId, 'failed', 'Rendering failed', 100, {
      error: formatApiError(error, 'Rendering failed.'),
    })
  }
}
