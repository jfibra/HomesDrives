import { execFile } from 'child_process'
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { cpus, tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'

import { safeRemoveDir } from '@/lib/reels-maker/safe-rm'

import {
  probeMediaDuration,
  processMusicTrackForMix,
  processVoiceTrackForMix,
  REEL_END_PAD_SEC,
  runFfmpegAudio,
  trimVideoToDuration,
} from '@/lib/reels-maker/audio-utils'
import { measureVoiceOverDuration } from '@/lib/reels-maker/audio-utils'
import { buildSceneBookendFilters, resolveSceneMotion, BLACK_LEADER_SEC, BLACK_TAIL_SEC } from '@/lib/reels-maker/ffmpeg-bookends'
import { applyLogoOverlayToVideo } from '@/lib/reels-maker/ffmpeg-logo'
import { applyQrOverlayToVideo } from '@/lib/reels-maker/ffmpeg-qr'
import { scalePlanForVoiceDuration, enforceMinSceneDurations } from '@/lib/reels-maker/plan-timing'
import { downloadReelObject } from '@/lib/reels-maker/storage'
import { buildAnimatedTextFilters, buildListingDetailsFilters } from '@/lib/reels-maker/ffmpeg-text'
import { buildColorGradeFilter } from '@/lib/reels-maker/ffmpeg-color-grade'
import {
  buildVideoMotionFilter,
} from '@/lib/reels-maker/cinematic-motion'
import {
  buildEditorialSceneFilterComplex,
  editorialCanvasColor,
} from '@/lib/reels-maker/ffmpeg-editorial-layouts'
import {
  buildBookendedSceneClips,
  buildXfadeFilterGraph,
  mergedOutputPath,
  readSceneClip,
  type SceneClip,
} from '@/lib/reels-maker/ffmpeg-transitions'
import { getReelFrameDimensions, normalizeReelAspectRatio } from '@/lib/reels-maker/aspect-ratio'
import type { ReelAspectRatio, ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'

import { buildReelVideoEncodeArgs } from '@/lib/reels-maker/render-quality'
import type {
  ReelLogoPosition,
  ReelOverlayDisplay,
  ReelScenePlan,
  ReelStoryPlan,
  ReelTemplateId,
  ReelUploadedMedia,
} from '@/lib/reels-maker/types'

/** Duration of the end window used for `display: "outro-only"` logo/QR overlays. */
export const OUTRO_OVERLAY_DURATION_SEC = 4

const execFileAsync = promisify(execFile)

const FPS = 30
const CPU_COUNT = cpus().length
/** Cap concurrency — concurrent zoompan+x264 on small EC2 instances often thrash/hang. */
const SCENE_RENDER_CONCURRENCY = Math.max(1, Math.min(2, CPU_COUNT - 1))
const FFMPEG_THREADS_PER_SCENE = Math.max(1, Math.floor(CPU_COUNT / Math.max(1, SCENE_RENDER_CONCURRENCY)))
const ENCODE_ARGS = [...buildReelVideoEncodeArgs(FPS)]

/** Wall-clock limits so a hung FFmpeg cannot freeze jobs at 78% forever. */
const FFMPEG_TIMEOUT_SCENE_MS = 90_000
const FFMPEG_TIMEOUT_MERGE_MS = 180_000
const FFMPEG_TIMEOUT_DEFAULT_MS = 120_000

async function resolveFfmpegBinary() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH
  try {
    const ffmpegStatic = await import('ffmpeg-static')
    if (ffmpegStatic.default) return ffmpegStatic.default
  } catch {
    // optional dependency
  }
  return 'ffmpeg'
}

async function mapPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0

  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()),
  )
  return results
}

async function runFfmpeg(args: string[], timeoutMs = FFMPEG_TIMEOUT_DEFAULT_MS) {
  const binary = await resolveFfmpegBinary()
  if (!binary) {
    throw new Error('FFmpeg binary not found. Install ffmpeg-static or set FFMPEG_PATH.')
  }
  try {
    await execFileAsync(binary, args, {
      maxBuffer: 1024 * 1024 * 64,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    })
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string }
    if (err.killed || err.signal === 'SIGKILL' || err.code === 'ETIMEDOUT') {
      throw new Error(`FFmpeg timed out after ${Math.round(timeoutMs / 1000)}s (possible hung encode).`)
    }
    throw error
  }
}

async function renderBlackClip(workDir: string, name: string, durationSeconds: number, frame: ReelFrameDimensions) {
  const outputPath = join(workDir, `${name}.mp4`)
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${frame.width}x${frame.height}:d=${durationSeconds}:r=${FPS}`,
    ...ENCODE_ARGS,
    outputPath,
  ])
  return outputPath
}

type SceneRenderContext = {
  reelTitle?: string
  isFirst: boolean
  isLast: boolean
}

async function renderImageScene(
  workDir: string,
  index: number,
  imagePath: string,
  scene: ReelScenePlan,
  context: SceneRenderContext,
  frame: ReelFrameDimensions,
  templateId: ReelTemplateId,
) {
  const outputPath = join(workDir, `scene-${index}.mp4`)
  const duration = scene.durationSeconds
  const motion = resolveSceneMotion(scene.motion, duration, context)
  const { filterComplex, layout } = buildEditorialSceneFilterComplex({
    frame,
    scene,
    sceneIndex: index,
    durationSeconds: duration,
    motion,
    templateId,
    reelTitle: context.reelTitle,
    isFirst: context.isFirst,
    isLast: context.isLast,
  })
  console.info(`[reels-maker/ffmpeg-render] scene ${index} editorial layout=${layout}`)

  const canvas = editorialCanvasColor()

  await runFfmpeg(
    [
      '-y',
      '-threads',
      String(FFMPEG_THREADS_PER_SCENE),
      '-loop',
      '1',
      '-framerate',
      String(FPS),
      '-i',
      imagePath,
      '-f',
      'lavfi',
      '-i',
      `color=c=0x${canvas}:s=${frame.width}x${frame.height}:d=${duration}:r=${FPS}`,
      '-filter_complex',
      filterComplex,
      '-map',
      '[vout]',
      '-t',
      String(duration),
      ...ENCODE_ARGS,
      outputPath,
    ],
    FFMPEG_TIMEOUT_SCENE_MS,
  )

  return outputPath
}

async function renderVideoScene(
  workDir: string,
  index: number,
  videoPath: string,
  scene: ReelScenePlan,
  context: SceneRenderContext,
  frame: ReelFrameDimensions,
  templateId: ReelTemplateId,
) {
  const outputPath = join(workDir, `scene-${index}.mp4`)
  const duration = scene.durationSeconds
  const colorGrade = buildColorGradeFilter(templateId)
  const videoTextOptions = {
    durationSeconds: duration,
    sceneIndex: index,
    reelTitle: context.reelTitle,
    isFirst: context.isFirst,
    isLast: context.isLast,
    sceneRole: scene.sceneRole,
  }
  const textFilter = scene.listingPriceText
    ? buildListingDetailsFilters(scene, videoTextOptions)
    : buildAnimatedTextFilters(scene, videoTextOptions)
  const bookends = buildSceneBookendFilters({
    durationSeconds: duration,
    isFirst: context.isFirst,
    isLast: context.isLast,
  })
  // Subtle cinematic push on video so clips aren't locked static
  const motion = buildVideoMotionFilter(duration, frame)

  await runFfmpeg(
    [
      '-y',
      '-threads',
      String(FFMPEG_THREADS_PER_SCENE),
      '-i',
      videoPath,
      '-vf',
      `${motion},${colorGrade}${textFilter}${bookends}`,
      '-t',
      String(duration),
      '-an',
      ...ENCODE_ARGS,
      outputPath,
    ],
    FFMPEG_TIMEOUT_SCENE_MS,
  )

  return outputPath
}

async function normalizeImageToJpeg(bytes: Buffer<ArrayBuffer>, frame: ReelFrameDimensions): Promise<Buffer<ArrayBuffer>> {
  const { default: sharp } = await import('sharp')
  const meta = await sharp(bytes, { failOn: 'none' }).metadata()
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const targetWidth = Math.round(frame.preScaleWidth)
  const targetHeight = Math.round(frame.preScaleHeight)
  const needsUpscale = width > 0 && height > 0 && (width < targetWidth || height < targetHeight)

  let pipeline = sharp(bytes, { failOn: 'none' }).rotate()
  if (needsUpscale) {
    // Source is smaller than the render frame — upscale with Lanczos3 and sharpen
    // to counter the softness that plain enlargement would leave for the Ken Burns pan/zoom.
    pipeline = pipeline
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: 'outside',
        kernel: sharp.kernel.lanczos3,
      })
      .sharpen({ sigma: 1 })
  }

  const result = await pipeline.jpeg({ quality: 95 }).toBuffer()
  return result as unknown as Buffer<ArrayBuffer>
}

async function downloadMediaToWorkDir(media: ReelUploadedMedia[], workDir: string, frame: ReelFrameDimensions) {
  const pathById = new Map<string, string>()
  await Promise.all(
    media.map(async (item) => {
      let bytes = await downloadReelObject(item.bucketName, item.storagePath)
      let extension: string
      if (item.kind === 'video') {
        extension = `.${item.fileName.split('.').pop()?.toLowerCase() || 'mp4'}`
      } else {
        // Normalize all images to JPEG to handle HEIC, AVIF, and other non-standard formats
        try {
          bytes = await normalizeImageToJpeg(bytes, frame)
        } catch {
          // keep original bytes if normalization fails — FFmpeg will surface a clearer error
        }
        extension = '.jpg'
      }
      const fullPath = join(workDir, `media-${item.id}${extension}`)
      await writeFile(fullPath, bytes)
      pathById.set(item.id, fullPath)
    }),
  )
  return pathById
}

async function concatScenesPlain(scenePaths: string[], workDir: string) {
  if (scenePaths.length === 1) {
    return readFile(scenePaths[0])
  }

  const listPath = join(workDir, 'concat.txt')
  const listContent = scenePaths.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join('\n')
  await writeFile(listPath, listContent, 'utf8')

  const mergedPath = join(workDir, 'merged.mp4')
  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-c',
    'copy',
    mergedPath,
  ])

  return readFile(mergedPath)
}

async function mergeScenesWithTransitions(scenes: SceneClip[], workDir: string) {
  if (scenes.length === 1) {
    return readSceneClip(scenes[0].path)
  }

  const filterGraph = buildXfadeFilterGraph(scenes)
  if (!filterGraph) {
    return concatScenesPlain(
      scenes.map((scene) => scene.path),
      workDir,
    )
  }

  const outputPath = mergedOutputPath(workDir)
  const args = ['-y']
  for (const scene of scenes) {
    args.push('-i', scene.path)
  }

  try {
    await runFfmpeg(
      [
        ...args,
        '-filter_complex',
        filterGraph,
        '-map',
        '[vout]',
        ...ENCODE_ARGS,
        outputPath,
      ],
      FFMPEG_TIMEOUT_MERGE_MS,
    )
    return readFile(outputPath)
  } catch (error) {
    console.warn('[reels-maker/ffmpeg-render] xfade merge failed, falling back to plain concat', error)
    return concatScenesPlain(
      scenes.map((scene) => scene.path),
      workDir,
    )
  }
}

async function muxAudio(
  videoBuffer: Buffer,
  workDir: string,
  options: { musicPath?: string; voicePath?: string },
) {
  const videoInputPath = join(workDir, 'video-silent.mp4')
  const outputPath = join(workDir, 'final.mp4')
  await writeFile(videoInputPath, videoBuffer)

  let videoPath = videoInputPath
  let actualVideoDuration = await probeMediaDuration(videoPath)

  let processedVoicePath: string | undefined
  let voiceDuration = 0
  if (options.voicePath) {
    processedVoicePath = join(workDir, 'voice-processed.wav')
    const processed = await processVoiceTrackForMix(options.voicePath, processedVoicePath)
    voiceDuration = processed.duration
  }

  let finalDuration = actualVideoDuration
  if (processedVoicePath && voiceDuration > 0) {
    finalDuration = voiceDuration + REEL_END_PAD_SEC
    if (actualVideoDuration > finalDuration + 0.05) {
      const trimmedVideoPath = join(workDir, 'video-trimmed.mp4')
      const trimmedDuration = await trimVideoToDuration(videoPath, trimmedVideoPath, finalDuration)
      videoPath = trimmedVideoPath
      actualVideoDuration = trimmedDuration || finalDuration
    } else if (actualVideoDuration + 0.05 < finalDuration) {
      finalDuration = actualVideoDuration
    }
  }

  if (processedVoicePath && voiceDuration > finalDuration + 0.05) {
    const trimmedVoicePath = join(workDir, 'voice-trimmed.wav')
    await runFfmpegAudio([
      '-y',
      '-i',
      processedVoicePath,
      '-af',
      `atrim=0:${finalDuration.toFixed(3)},asetpts=PTS-STARTPTS`,
      trimmedVoicePath,
    ])
    processedVoicePath = trimmedVoicePath
    voiceDuration = finalDuration
  }

  finalDuration = Math.min(finalDuration, actualVideoDuration || finalDuration)
  const durationArgs = finalDuration >= 1 ? ['-t', finalDuration.toFixed(3)] : []

  if (options.musicPath && processedVoicePath) {
    const musicProcessedPath = join(workDir, 'music-processed.wav')
    await processMusicTrackForMix(options.musicPath, musicProcessedPath, finalDuration)
    await runFfmpegAudio([
      '-y',
      '-i',
      videoPath,
      '-i',
      musicProcessedPath,
      '-i',
      processedVoicePath,
      '-filter_complex',
      '[1:a][2:a]amix=inputs=2:duration=first:dropout_transition=2[aout]',
      '-map',
      '0:v',
      '-map',
      '[aout]',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      ...durationArgs,
      outputPath,
    ])
    return readFile(outputPath)
  }

  if (processedVoicePath) {
    await runFfmpegAudio([
      '-y',
      '-i',
      videoPath,
      '-i',
      processedVoicePath,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      ...durationArgs,
      outputPath,
    ])
    return readFile(outputPath)
  }

  if (options.musicPath) {
    const musicProcessedPath = join(workDir, 'music-processed.wav')
    await processMusicTrackForMix(options.musicPath, musicProcessedPath, finalDuration)
    await runFfmpegAudio([
      '-y',
      '-i',
      videoPath,
      '-i',
      musicProcessedPath,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      ...durationArgs,
      outputPath,
    ])
    return readFile(outputPath)
  }

  return videoBuffer
}

export async function renderReelWithFfmpeg(params: {
  plan: ReelStoryPlan
  media: ReelUploadedMedia[]
  aspectRatio?: ReelAspectRatio
  music?: { bucketName: string; storagePath: string } | null
  logo?: {
    bucketName: string
    storagePath: string
    position: ReelLogoPosition
    display?: ReelOverlayDisplay
  } | null
  qr?: {
    bucketName: string
    storagePath: string
    position: ReelLogoPosition
    display?: ReelOverlayDisplay
  } | null
  agentHeadshot?: { bucketName: string; storagePath: string } | null
  listing?: { price?: string; address?: string; beds?: string; baths?: string; sqft?: string; listingUrl?: string } | null
  agent?: { name?: string; phone?: string; email?: string; agencyName?: string } | null
  outroCtaText?: string | null
  outroEnabled?: boolean
  voiceOver?: Buffer | null
  voiceOverPromise?: Promise<Buffer | null> | null
  onProgress?: (message: string, progress: number) => void
}) {
  const report = (message: string, progress: number) => {
    try {
      params.onProgress?.(message, progress)
    } catch {
      // never block render on status callbacks
    }
  }

  const frame = getReelFrameDimensions(normalizeReelAspectRatio(params.aspectRatio))
  const workDir = await mkdtemp(join(tmpdir(), 'reels-maker-'))
  const mediaById = new Map(params.media.map((item) => [item.id, item]))

  try {
    const voiceOver =
      params.voiceOverPromise != null
        ? await params.voiceOverPromise
        : (params.voiceOver ?? null)

    let renderPlan = params.plan
    if (voiceOver?.length) {
      const voiceDuration = await measureVoiceOverDuration(voiceOver)
      if (voiceDuration > 0) {
        renderPlan = scalePlanForVoiceDuration(params.plan, voiceDuration)
      }
    }
    renderPlan = enforceMinSceneDurations(renderPlan)

    const scenes = renderPlan.scenes
      .map((scene, index) => ({
        scene,
        index,
        mediaItem: mediaById.get(scene.mediaId),
      }))
      .filter((entry): entry is { scene: ReelScenePlan; index: number; mediaItem: ReelUploadedMedia } =>
        Boolean(entry.mediaItem),
      )

    const uniqueMedia = [...new Map(scenes.map((entry) => [entry.mediaItem.id, entry.mediaItem])).values()]

    const totalScenes = scenes.length

    report('Downloading media…', 79)
    const voicePromise = Promise.resolve(voiceOver)
    const [resolvedVoiceOver, mediaPaths, blackLeaderPath, blackTailPath] = await Promise.all([
      voicePromise,
      downloadMediaToWorkDir(uniqueMedia, workDir, frame),
      renderBlackClip(workDir, 'black-leader', BLACK_LEADER_SEC, frame),
      renderBlackClip(workDir, 'black-tail', BLACK_TAIL_SEC, frame),
    ])

    report(`Rendering ${totalScenes} scenes…`, 82)
    const scenePaths = await mapPool(scenes, SCENE_RENDER_CONCURRENCY, async ({ scene, index, mediaItem }) => {
      const inputPath = mediaPaths.get(mediaItem.id)
      if (!inputPath) throw new Error(`Missing media for scene ${index}.`)

      const context: SceneRenderContext = {
        reelTitle: renderPlan.title,
        isFirst: index === 0,
        isLast: index === totalScenes - 1,
      }

      return mediaItem.kind === 'video'
        ? renderVideoScene(workDir, index, inputPath, scene, context, frame, renderPlan.templateId)
        : renderImageScene(workDir, index, inputPath, scene, context, frame, renderPlan.templateId)
    })

    if (!scenePaths.length) {
      throw new Error('No scenes were rendered.')
    }

    let sceneClips = scenePaths.map((path, sceneIndex) => ({
      path,
      durationSeconds: scenes[sceneIndex].scene.durationSeconds,
      transition: scenes[sceneIndex].scene.transition,
    }))

    const isListingShowcase = renderPlan.templateId === 'listing-showcase'
    let logoBuffer: Buffer | null = null
    let qrBuffer: Buffer | null = null
    const outroEnabled = params.outroEnabled !== false

    if (params.logo) {
      logoBuffer = await downloadReelObject(params.logo.bucketName, params.logo.storagePath)
    }
    if (params.qr) {
      qrBuffer = await downloadReelObject(params.qr.bucketName, params.qr.storagePath)
    }

    if (isListingShowcase) {
      const { renderLogoIntroScene, renderLogoOutroScene, renderAgentCardScene } = await import(
        '@/lib/reels-maker/ffmpeg-listing-scenes'
      )

      const headshotBuffer = params.agentHeadshot
        ? await downloadReelObject(params.agentHeadshot.bucketName, params.agentHeadshot.storagePath)
        : null

      const combined: typeof sceneClips = []

      if (logoBuffer) {
        const intro = await renderLogoIntroScene({ frame, logoBuffer })
        const introPath = join(workDir, 'listing-intro.mp4')
        await writeFile(introPath, intro.buffer)
        combined.push({ path: introPath, durationSeconds: intro.durationSeconds, transition: 'fade' })
      }

      sceneClips.forEach((clip, index) => {
        combined.push(index === 0 && combined.length ? { ...clip, transition: 'cross-dissolve' } : clip)
      })

      const agent = params.agent ?? {}
      const hasAgentCardContent = Boolean(
        headshotBuffer || qrBuffer || agent.name || agent.phone || agent.email || agent.agencyName,
      )
      if (hasAgentCardContent) {
        const agentCard = await renderAgentCardScene({
          frame,
          logoBuffer,
          headshotBuffer,
          qrBuffer,
          agent,
        })
        const agentCardPath = join(workDir, 'listing-agent-card.mp4')
        await writeFile(agentCardPath, agentCard.buffer)
        combined.push({ path: agentCardPath, durationSeconds: agentCard.durationSeconds, transition: 'fade' })
      }

      if (outroEnabled && logoBuffer) {
        const outro = await renderLogoOutroScene({
          frame,
          logoBuffer,
          ctaText: params.outroCtaText || 'Scan to view listing',
        })
        const outroPath = join(workDir, 'listing-outro.mp4')
        await writeFile(outroPath, outro.buffer)
        combined.push({ path: outroPath, durationSeconds: outro.durationSeconds, transition: 'fade' })
      }

      sceneClips = combined
    } else if (outroEnabled && (logoBuffer || qrBuffer || params.outroCtaText?.trim())) {
      // Dedicated end card for non-listing templates
      report('Building end card…', 85)
      const { renderBrandedEndCardScene } = await import('@/lib/reels-maker/ffmpeg-listing-scenes')
      const endCard = await renderBrandedEndCardScene({
        frame,
        logoBuffer,
        qrBuffer: params.qr?.display === 'outro-only' || !params.logo ? qrBuffer : qrBuffer,
        ctaText: params.outroCtaText || 'Discover more on Homes.ph',
      })
      const endPath = join(workDir, 'branded-end-card.mp4')
      await writeFile(endPath, endCard.buffer)
      sceneClips = [
        ...sceneClips,
        { path: endPath, durationSeconds: endCard.durationSeconds, transition: 'fade' as const },
      ]
    }

    report('Merging scenes…', 87)
    const bookendedClips = buildBookendedSceneClips(sceneClips, blackLeaderPath, blackTailPath)

    let outputBuffer = await mergeScenesWithTransitions(bookendedClips, workDir)

    // Skip full-video watermark if branding already lives on the end card for outro-only
    const skipLogoOverlay =
      isListingShowcase ||
      (outroEnabled && params.logo?.display === 'outro-only' && Boolean(logoBuffer))
    const skipQrOverlay =
      isListingShowcase ||
      (outroEnabled && params.qr?.display === 'outro-only' && Boolean(qrBuffer))

    const needsOutroTiming =
      (!skipLogoOverlay && params.logo?.display === 'outro-only') ||
      (!skipQrOverlay && params.qr?.display === 'outro-only')

    let outroEnableFrom: number | null = null
    if (needsOutroTiming) {
      const probePath = join(workDir, 'merged-probe.mp4')
      await writeFile(probePath, outputBuffer)
      const duration = await probeMediaDuration(probePath)
      if (duration > 0) {
        outroEnableFrom = Math.max(0, duration - OUTRO_OVERLAY_DURATION_SEC)
      }
    }

    if (params.logo && !skipLogoOverlay) {
      const logoBytes = logoBuffer ?? (await downloadReelObject(params.logo.bucketName, params.logo.storagePath))
      const logoName = params.logo.storagePath.split('/').pop() ?? 'logo.png'
      const logoTiming =
        params.logo.display === 'outro-only' && outroEnableFrom != null
          ? { enableFromSeconds: outroEnableFrom }
          : undefined
      outputBuffer = Buffer.from(await applyLogoOverlayToVideo(
        outputBuffer,
        logoBytes,
        logoName,
        params.logo.position,
        frame.width,
        logoTiming,
      ))
    }

    if (params.qr && !skipQrOverlay) {
      const qrBytes = qrBuffer ?? (await downloadReelObject(params.qr.bucketName, params.qr.storagePath))
      const qrName = params.qr.storagePath.split('/').pop() ?? 'qr.png'
      const qrTiming =
        params.qr.display === 'outro-only' && outroEnableFrom != null
          ? { enableFromSeconds: outroEnableFrom }
          : undefined
      outputBuffer = Buffer.from(await applyQrOverlayToVideo(
        outputBuffer,
        qrBytes,
        qrName,
        params.qr.position,
        frame.width,
        qrTiming,
      ))
    }

    let musicPath: string | undefined
    let voicePath: string | undefined

    if (params.music) {
      const musicBytes = await downloadReelObject(params.music.bucketName, params.music.storagePath)
      musicPath = join(workDir, 'music.audio')
      await writeFile(musicPath, musicBytes)
    }

    if (resolvedVoiceOver?.length) {
      voicePath = join(workDir, 'voice.wav')
      await writeFile(voicePath, resolvedVoiceOver)
    }

    if (musicPath || voicePath) {
      outputBuffer = Buffer.from(await muxAudio(outputBuffer, workDir, {
        musicPath,
        voicePath,
      }))
    }

    return outputBuffer
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 150))
    await safeRemoveDir(workDir)
  }
}
