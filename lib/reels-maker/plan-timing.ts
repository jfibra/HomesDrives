import { buildBookendedSceneClips, estimateMergedDuration } from '@/lib/reels-maker/ffmpeg-transitions'
import type { ReelStoryPlan } from '@/lib/reels-maker/types'

/** Soft floor so VO stretch doesn't collapse luxury short beats into blinks. */
export const MIN_SCENE_SEC = 1.8

/** Upper bound per photo when stretching to match narration. */
export const MAX_SCENE_SEC = 14

/**
 * Scale scene durations to fit voice while preserving relative role pacing
 * (hook stays shorter relative to hero, etc.).
 */
export function scalePlanForVoiceDuration(plan: ReelStoryPlan, voiceDurationSeconds: number): ReelStoryPlan {
  const sceneCount = plan.scenes.length
  if (!voiceDurationSeconds || !sceneCount) return plan

  const weights = plan.scenes.map((scene) => Math.max(0.5, scene.durationSeconds))
  const weightSum = weights.reduce((a, b) => a + b, 0)

  const estimateWeighted = (scale: number) => {
    const sceneClips = plan.scenes.map((scene, index) => ({
      path: 'scene',
      durationSeconds: Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, weights[index] * scale)),
      transition: scene.transition,
    }))
    return estimateMergedDuration(buildBookendedSceneClips(sceneClips, 'leader', 'tail'))
  }

  let low = 0.5
  let high = 4
  while (estimateWeighted(high) < voiceDurationSeconds && high < 8) {
    high += 0.5
  }

  for (let step = 0; step < 28; step++) {
    const mid = (low + high) / 2
    if (estimateWeighted(mid) < voiceDurationSeconds) low = mid
    else high = mid
  }

  const scale = (low + high) / 2
  const scenes = plan.scenes.map((scene, index) => ({
    ...scene,
    durationSeconds: Number(
      Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, weights[index] * scale)).toFixed(2),
    ),
  }))

  const merged = estimateMergedDuration(
    buildBookendedSceneClips(
      scenes.map((scene) => ({
        path: 'scene',
        durationSeconds: scene.durationSeconds,
        transition: scene.transition,
      })),
      'leader',
      'tail',
    ),
  )

  console.info(
    `[reels-maker/plan-timing] ${sceneCount} scenes weighted scale ${scale.toFixed(2)} (merged ${merged.toFixed(1)}s, voice ${voiceDurationSeconds.toFixed(1)}s, weightSum ${weightSum.toFixed(1)})`,
  )

  return { ...plan, scenes }
}

export function estimateVoiceAlignedDuration(plan: ReelStoryPlan) {
  const sceneClips = plan.scenes.map((scene) => ({
    path: 'scene',
    durationSeconds: scene.durationSeconds,
    transition: scene.transition,
  }))
  return estimateMergedDuration(buildBookendedSceneClips(sceneClips, 'leader', 'tail'))
}
