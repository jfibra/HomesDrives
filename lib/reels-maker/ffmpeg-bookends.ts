import type { ReelSceneMotion, ReelScenePlan } from '@/lib/reels-maker/types'
import { normalizeMotion } from '@/lib/reels-maker/cinematic-motion'

/** Punchy open — keep feed preview on content, not black. */
export const ENTRANCE_FADE_SEC = 0.35
export const EXIT_FADE_SEC = 0.7
export const BLACK_LEADER_SEC = 0.12
export const BLACK_TAIL_SEC = 0.28
export const ENTRANCE_XFADE_SEC = 0.28
export const EXIT_XFADE_SEC = 0.5

export type SceneBookendOptions = {
  durationSeconds: number
  isFirst: boolean
  isLast: boolean
}

/** Light per-scene polish — main entrance/exit is handled by black leader/tail + fadeblack xfade. */
export function buildSceneBookendFilters(options: SceneBookendOptions) {
  if (options.isFirst || options.isLast) return ''
  return ',fade=t=in:st=0:d=0.18'
}

/**
 * Preserve planned cinematic motions. Only force punchy dolly-in on single-scene reels.
 */
export function resolveSceneMotion(
  motion: ReelScenePlan['motion'],
  durationSeconds: number,
  options: { isFirst: boolean; isLast: boolean },
): ReelSceneMotion {
  void durationSeconds
  const resolved = normalizeMotion(motion)
  if (options.isFirst && options.isLast) return 'dolly-in'
  if (options.isFirst && resolved === 'dolly-out') return 'dolly-in'
  return resolved
}
