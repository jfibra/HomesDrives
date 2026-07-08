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
import { scalePlanForVoiceDuration } from '@/lib/reels-maker/plan-timing'
import { downloadReelObject } from '@/lib/reels-maker/storage'
import { buildAnimatedTextFilters } from '@/lib/reels-maker/ffmpeg-text'
import {
  buildBookendedSceneClips,
  buildXfadeFilterGraph,
  mergedOutputPath,
  readSceneClip,
  type SceneClip,
} from '@/lib/reels-maker/ffmpeg-transitions'
import { getReelFrameDimensions, normalizeReelAspectRatio } from '@/lib/reels-maker/aspect-ratio'
import type { ReelAspectRatio, ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'

import { buildReelVideoEncodeArgs, REEL_SCALE_FLAGS } from '@/lib/reels-maker/render-quality'
import type { ReelLogoPosition, ReelScenePlan, ReelStoryPlan, ReelUploadedMedia } from '@/lib/reels-maker/types'

const execFileAsync = promisify(execFile)

const FPS = 30
const CPU_COUNT = cpus().length
const SCENE_RENDER_CONCURRENCY = Math.max(2, Math.min(4, CPU_COUNT - 1))
const FFMPEG_THREADS_PER_SCENE = Math.max(1, Math.floor(CPU_COUNT / SCENE_RENDER_CONCURRENCY))
const ENCODE_ARGS = [...buildReelVideoEncodeArgs(FPS)]

function buildFrameFilters(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  const preScale = `scale=${frame.preScaleWidth}:${frame.preScaleHeight}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.preScaleWidth}:${frame.preScaleHeight}`
  const staticScale = `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.width}:${frame.height},fps=${FPS}`
  return { preScale, staticScale }
}

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

function getMotionFilter(
  motion: ReelScenePlan['motion'],
  durationSeconds: number,
  frame: ReelFrameDimensions,
) {
  const { preScale } = buildFrameFilters(frame)
  const frames = Math.max(1, Math.round(durationSeconds * FPS))

  switch (motion) {
    case 'slow-zoom-in': {
      const z = `1.0+0.06*on/${frames}`
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${frame.width}x${frame.height}:fps=${FPS}`
    }
    case 'slow-zoom-out': {
      const z = `1.06-0.06*on/${frames}`
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${frame.width}x${frame.height}:fps=${FPS}`
    }
    case 'gentle-pan-left':
      return `${preScale},zoompan=z='1.04':x='(iw-iw/zoom)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${frame.width}x${frame.height}:fps=${FPS}`
    case 'gentle-pan-right':
      return `${preScale},zoompan=z='1.04':x='(iw-iw/zoom)*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${frame.width}x${frame.height}:fps=${FPS}`
    case 'static':
    default:
      return buildFrameFilters(frame).staticScale
  }
}

async function runFfmpeg(args: string[]) {
  const binary = await resolveFfmpegBinary()
  if (!binary) {
    throw new Error('FFmpeg binary not found. Install ffmpeg-static or set FFMPEG_PATH.')
  }
  await execFileAsync(binary, args, { maxBuffer: 1024 * 1024 * 64 })
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
) {
  const outputPath = join(workDir, `scene-${index}.mp4`)
  const duration = scene.durationSeconds
  const motion = getMotionFilter(
    resolveSceneMotion(scene.motion, duration, context),
    duration,
    frame,
  )
  const textFilter = buildAnimatedTextFilters(scene, {
    durationSeconds: duration,
    sceneIndex: index,
    reelTitle: context.reelTitle,
    isFirst: context.isFirst,
    isLast: context.isLast,
  })
  const bookends = buildSceneBookendFilters({
    durationSeconds: duration,
    isFirst: context.isFirst,
    isLast: context.isLast,
  })

  await runFfmpeg([
    '-y',
    '-threads',
    String(FFMPEG_THREADS_PER_SCENE),
    '-loop',
    '1',
    '-i',
    imagePath,
    '-vf',
    `${motion}${textFilter}${bookends}`,
    '-t',
    String(duration),
    ...ENCODE_ARGS,
    outputPath,
  ])

  return outputPath
}

async function renderVideoScene(
  workDir: string,
  index: number,
  videoPath: string,
  scene: ReelScenePlan,
  context: SceneRenderContext,
  frame: ReelFrameDimensions,
) {
  const outputPath = join(workDir, `scene-${index}.mp4`)
  const duration = scene.durationSeconds
  const textFilter = buildAnimatedTextFilters(scene, {
    durationSeconds: duration,
    sceneIndex: index,
    reelTitle: context.reelTitle,
    isFirst: context.isFirst,
    isLast: context.isLast,
  })
  const bookends = buildSceneBookendFilters({
    durationSeconds: duration,
    isFirst: context.isFirst,
    isLast: context.isLast,
  })
  const { staticScale } = buildFrameFilters(frame)

  await runFfmpeg([
    '-y',
    '-threads',
    String(FFMPEG_THREADS_PER_SCENE),
    '-i',
    videoPath,
    '-vf',
    `${staticScale}${textFilter}${bookends}`,
    '-t',
    String(duration),
    '-an',
    ...ENCODE_ARGS,
    outputPath,
  ])

  return outputPath
}

async function normalizeImageToJpeg(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(bytes, { failOn: 'none' }).rotate().jpeg({ quality: 95 }).toBuffer()
}

async function downloadMediaToWorkDir(media: ReelUploadedMedia[], workDir: string) {
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
          bytes = await normalizeImageToJpeg(bytes)
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
    await runFfmpeg([
      ...args,
      '-filter_complex',
      filterGraph,
      '-map',
      '[vout]',
      ...ENCODE_ARGS,
      outputPath,
    ])
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
  logo?: { bucketName: string; storagePath: string; position: ReelLogoPosition } | null
  voiceOver?: Buffer | null
  voiceOverPromise?: Promise<Buffer | null> | null
}) {
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

    const voicePromise = Promise.resolve(voiceOver)
    const [resolvedVoiceOver, mediaPaths, blackLeaderPath, blackTailPath] = await Promise.all([
      voicePromise,
      downloadMediaToWorkDir(uniqueMedia, workDir),
      renderBlackClip(workDir, 'black-leader', BLACK_LEADER_SEC, frame),
      renderBlackClip(workDir, 'black-tail', BLACK_TAIL_SEC, frame),
    ])

    const scenePaths = await mapPool(scenes, SCENE_RENDER_CONCURRENCY, async ({ scene, index, mediaItem }) => {
      const inputPath = mediaPaths.get(mediaItem.id)
      if (!inputPath) throw new Error(`Missing media for scene ${index}.`)

      const context: SceneRenderContext = {
        reelTitle: renderPlan.title,
        isFirst: index === 0,
        isLast: index === totalScenes - 1,
      }

      return mediaItem.kind === 'video'
        ? renderVideoScene(workDir, index, inputPath, scene, context, frame)
        : renderImageScene(workDir, index, inputPath, scene, context, frame)
    })

    if (!scenePaths.length) {
      throw new Error('No scenes were rendered.')
    }

    const sceneClips = scenePaths.map((path, sceneIndex) => ({
      path,
      durationSeconds: scenes[sceneIndex].scene.durationSeconds,
      transition: scenes[sceneIndex].scene.transition,
    }))

    const bookendedClips = buildBookendedSceneClips(sceneClips, blackLeaderPath, blackTailPath)

    let outputBuffer = await mergeScenesWithTransitions(bookendedClips, workDir)

    if (params.logo) {
      const logoBytes = await downloadReelObject(params.logo.bucketName, params.logo.storagePath)
      const logoName = params.logo.storagePath.split('/').pop() ?? 'logo.png'
      outputBuffer = await applyLogoOverlayToVideo(
        outputBuffer,
        logoBytes,
        logoName,
        params.logo.position,
        frame.width,
      )
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
      outputBuffer = await muxAudio(outputBuffer, workDir, {
        musicPath,
        voicePath,
      })
    }

    return outputBuffer
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 150))
    await safeRemoveDir(workDir)
  }
}
