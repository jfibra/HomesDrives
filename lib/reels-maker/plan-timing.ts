import { buildBookendedSceneClips, estimateMergedDuration } from '@/lib/reels-maker/ffmpeg-transitions'
import type { ReelSceneTransition, ReelStoryPlan } from '@/lib/reels-maker/types'

/** Hard floor — every photo holds long enough that soft blends still feel like ~2s. */
export const MIN_SCENE_SEC = 2.35

/** Upper bound per photo when stretching to match narration. */
export const MAX_SCENE_SEC = 14

/** Minimum branded/YouTube outro hold (seconds). Keep in sync with BRANDED_OUTRO_DURATION_SEC. */
export const MIN_OUTRO_HOLD_SEC = 8

/** Default plate hold after the last spoken word (seconds). */
export const DEFAULT_OUTRO_PAD_SEC = 3

export function resolveOutroHoldSeconds(requested?: number | null) {
  if (requested == null || !Number.isFinite(requested)) return MIN_OUTRO_HOLD_SEC
  return Math.max(MIN_OUTRO_HOLD_SEC, Math.min(90, Number(requested)))
}

export function resolveOutroPadSeconds(requested?: number | null) {
  if (requested == null || !Number.isFinite(requested)) return DEFAULT_OUTRO_PAD_SEC
  return Math.max(0, Math.min(5, Number(requested)))
}

/**
 * Grow the outro plate so the merged timeline covers the full voiceover (+ pad).
 * Never shrinks below {@link minOutroSeconds}.
 */
export function computeOutroDurationForVoice(params: {
  tourClips: Array<{ durationSeconds: number; transition: ReelSceneTransition }>
  voiceDurationSeconds: number
  minOutroSeconds: number
  padAfterVoiceSeconds: number
}): number {
  const minOutro = Math.max(MIN_OUTRO_HOLD_SEC, params.minOutroSeconds)
  const needed = Math.max(0, params.voiceDurationSeconds) + Math.max(0, params.padAfterVoiceSeconds)
  if (!(needed > 0) || params.tourClips.length === 0) return Number(minOutro.toFixed(2))

  const estimate = (outroSec: number) =>
    estimateMergedDuration(
      buildBookendedSceneClips(
        [
          ...params.tourClips.map((clip) => ({
            path: 'scene',
            durationSeconds: clip.durationSeconds,
            transition: clip.transition,
          })),
          { path: 'outro', durationSeconds: outroSec, transition: 'fade' as const },
        ],
        'leader',
        'tail',
      ),
    )

  let outro = minOutro
  let guard = 0
  while (estimate(outro) + 0.02 < needed && outro < 90 && guard < 80) {
    const shortfall = needed - estimate(outro)
    outro = Math.min(90, outro + Math.max(0.2, shortfall + 0.05))
    guard += 1
  }

  return Number(outro.toFixed(2))
}

/** Clamp every scene to at least {@link MIN_SCENE_SEC} (exact 2s hold unless VO stretches longer). */
export function enforceMinSceneDurations(plan: ReelStoryPlan): ReelStoryPlan {
  return {
    ...plan,
    scenes: plan.scenes.map((scene) => ({
      ...scene,
      durationSeconds: Number(
        Math.max(MIN_SCENE_SEC, scene.durationSeconds > 0 ? scene.durationSeconds : MIN_SCENE_SEC).toFixed(2),
      ),
    })),
  }
}

/**
 * Scale scene durations to fit voice while preserving relative role pacing.
 * Never goes below {@link MIN_SCENE_SEC} — if narration is short, the reel
 * stays longer and music fills the gap (better than flashing photos).
 */
export function scalePlanForVoiceDuration(plan: ReelStoryPlan, voiceDurationSeconds: number): ReelStoryPlan {
  const sceneCount = plan.scenes.length
  if (!voiceDurationSeconds || !sceneCount) return enforceMinSceneDurations(plan)

  const weights = plan.scenes.map((scene) => Math.max(MIN_SCENE_SEC, scene.durationSeconds))
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

  const next = enforceMinSceneDurations({ ...plan, scenes })
  const merged = estimateVoiceAlignedDuration(next)

  console.info(
    `[reels-maker/plan-timing] ${sceneCount} scenes weighted scale ${scale.toFixed(2)} (merged ${merged.toFixed(1)}s, voice ${voiceDurationSeconds.toFixed(1)}s, weightSum ${weightSum.toFixed(1)})`,
  )

  return next
}

export function estimateVoiceAlignedDuration(plan: ReelStoryPlan) {
  const sceneClips = plan.scenes.map((scene) => ({
    path: 'scene',
    durationSeconds: scene.durationSeconds,
    transition: scene.transition,
  }))
  return estimateMergedDuration(buildBookendedSceneClips(sceneClips, 'leader', 'tail'))
}
