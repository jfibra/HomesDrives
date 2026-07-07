import type { ReelScenePlan } from '@/lib/reels-maker/types'

export const ENTRANCE_FADE_SEC = 0.9
export const EXIT_FADE_SEC = 1.0
export const BLACK_LEADER_SEC = 0.35
export const BLACK_TAIL_SEC = 0.35
export const ENTRANCE_XFADE_SEC = 0.55
export const EXIT_XFADE_SEC = 0.6

export type SceneBookendOptions = {
  durationSeconds: number
  isFirst: boolean
  isLast: boolean
}

/** Light per-scene polish — main entrance/exit is handled by black leader/tail + fadeblack xfade. */
export function buildSceneBookendFilters(options: SceneBookendOptions) {
  if (options.isFirst || options.isLast) return ''
  return ',fade=t=in:st=0:d=0.22'
}

export function resolveSceneMotion(
  motion: ReelScenePlan['motion'],
  durationSeconds: number,
  options: { isFirst: boolean; isLast: boolean },
): ReelScenePlan['motion'] {
  void durationSeconds
  if (options.isFirst && options.isLast) return 'slow-zoom-in'
  if (options.isFirst) {
    if (motion === 'gentle-pan-left' || motion === 'gentle-pan-right') return motion
    return 'slow-zoom-in'
  }
  if (options.isLast) {
    if (motion === 'slow-zoom-in') return 'slow-zoom-out'
    if (motion === 'static') return 'slow-zoom-out'
    return motion
  }
  return motion
}
