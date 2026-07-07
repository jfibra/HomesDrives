import { randomUUID } from 'crypto'

import { generateReelStoryPlan } from '@/lib/reels-maker/gemini-story'
import { generateVoiceOverAudio, resolveVoiceOutroLine, fitVoiceScriptToScenes, buildVoiceOverDisplayScript } from '@/lib/reels-maker/voice-over'
import { createReelJob, getReelJob, setReelJobStatus, updateReelJob } from '@/lib/reels-maker/job-store'
import { selectBestMedia, uploadRenderedReel } from '@/lib/reels-maker/storage'
import type {
  CreateReelJobInput,
  ReelJob,
  ReelLogoPosition,
  ReelUploadedMedia,
} from '@/lib/reels-maker/types'

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
    voiceOverEnabled: input.voiceOverEnabled,
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
  options: { enabled: boolean; position: ReelLogoPosition },
) {
  return updateReelJob(jobId, {
    logoEnabled: options.enabled,
    logoBucketName: logo.bucketName,
    logoStoragePath: logo.storagePath,
    logoPublicUrl: logo.publicUrl,
    logoPosition: options.position,
  })
}

export function runReelJobPipeline(jobId: string) {
  void processReelJob(jobId)
}

async function processReelJob(jobId: string) {
  const job = getReelJob(jobId)
  if (!job) return

  try {
    setReelJobStatus(jobId, 'analyzing', 'Analyzing media…', 40)
    const selectedMedia = selectBestMedia(job.media)
    if (!selectedMedia.length) {
      throw new Error('No media was uploaded. Add at least one photo or video.')
    }

    updateReelJob(jobId, { media: selectedMedia })

    setReelJobStatus(jobId, 'generating_story', 'Generating story…', 55)
    const story = await generateReelStoryPlan({
      media: selectedMedia,
      templateId: job.templateId,
      voiceOverEnabled: job.voiceOverEnabled,
      reelBrief: job.reelBrief || undefined,
      customCaption: job.caption || undefined,
    })

    const sceneCount = story.plan.scenes.length
    const outroLine = resolveVoiceOutroLine({
      customOutro: job.outroLine || undefined,
      reelBrief: job.reelBrief,
    })
    const mainScript = fitVoiceScriptToScenes(story.plan.voiceOverScript, sceneCount)
    const voiceScript = buildVoiceOverDisplayScript(mainScript, outroLine)

    setReelJobStatus(jobId, 'writing_captions', 'Writing captions…', 65, {
      plan: story.plan,
      caption: story.caption,
      hashtags: story.hashtags,
      voiceOverScript: voiceScript,
    })

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
          }
        : null

    const { renderReelWithFfmpeg } = await import('@/lib/reels-maker/ffmpeg-render')
    const rendered = await renderReelWithFfmpeg({
      plan: story.plan,
      media: selectedMedia,
      music,
      logo,
      voiceOver: voiceOverBuffer,
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
      error: error instanceof Error ? error.message : 'Rendering failed.',
    })
  }
}
