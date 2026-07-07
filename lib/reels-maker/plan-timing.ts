import { buildBookendedSceneClips, estimateMergedDuration } from '@/lib/reels-maker/ffmpeg-transitions'
import type { ReelStoryPlan } from '@/lib/reels-maker/types'

/** Minimum hold per photo — keeps the slideshow feeling slow and cinematic. */
export const MIN_SCENE_SEC = 3.5

/** Upper bound per photo when stretching to match narration. */
export const MAX_SCENE_SEC = 14

function estimateMergedForUniformScenes(
  scenes: ReelStoryPlan['scenes'],
  durationSeconds: number,
): number {
  const sceneClips = scenes.map((scene) => ({
    path: 'scene',
    durationSeconds,
    transition: scene.transition,
  }))
  return estimateMergedDuration(buildBookendedSceneClips(sceneClips, 'leader', 'tail'))
}

export function scalePlanForVoiceDuration(plan: ReelStoryPlan, voiceDurationSeconds: number): ReelStoryPlan {
  const sceneCount = plan.scenes.length
  if (!voiceDurationSeconds || !sceneCount) return plan

  const targetMerged = voiceDurationSeconds

  let low = MIN_SCENE_SEC
  let high = MAX_SCENE_SEC

  while (estimateMergedForUniformScenes(plan.scenes, high) < targetMerged && high < 24) {
    high = Math.min(24, high + 2)
  }

  for (let step = 0; step < 28; step++) {
    const mid = (low + high) / 2
    const merged = estimateMergedForUniformScenes(plan.scenes, mid)
    if (merged < targetMerged) low = mid
    else high = mid
  }

  const perScene = Number(((low + high) / 2).toFixed(2))
  const merged = estimateMergedForUniformScenes(plan.scenes, perScene)

  console.info(
    `[reels-maker/plan-timing] ${sceneCount} scenes → ${perScene}s each (merged ${merged.toFixed(1)}s, voice ${voiceDurationSeconds.toFixed(1)}s)`,
  )

  return {
    ...plan,
    scenes: plan.scenes.map((scene) => ({
      ...scene,
      durationSeconds: perScene,
    })),
  }
}

export function estimateVoiceAlignedDuration(plan: ReelStoryPlan) {
  const sceneClips = plan.scenes.map((scene) => ({
    path: 'scene',
    durationSeconds: scene.durationSeconds,
    transition: scene.transition,
  }))
  return estimateMergedDuration(buildBookendedSceneClips(sceneClips, 'leader', 'tail'))
}
