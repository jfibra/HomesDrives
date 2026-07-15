import { readFile } from 'fs/promises'
import { join } from 'path'

import {
  BLACK_LEADER_SEC,
  BLACK_TAIL_SEC,
  ENTRANCE_XFADE_SEC,
  EXIT_XFADE_SEC,
} from '@/lib/reels-maker/ffmpeg-bookends'
import type { ReelSceneTransition } from '@/lib/reels-maker/types'

export const DEFAULT_TRANSITION_SEC = 0.48

type TransitionSpec = {
  xfade: string
  duration: number
}

/** Map plan transition names → real FFmpeg xfade modes.
 *  Keep transitions short so a 2s photo hold still feels like ~2s on screen. */
const TRANSITION_SPECS: Record<ReelSceneTransition, TransitionSpec> = {
  fade: { xfade: 'fade', duration: 0.2 },
  'cross-dissolve': { xfade: 'dissolve', duration: 0.22 },
  cut: { xfade: 'fade', duration: 0.04 },
  'zoom-cut': { xfade: 'fade', duration: 0.18 },
  'slide-left': { xfade: 'slideleft', duration: 0.25 },
  'slide-right': { xfade: 'slideright', duration: 0.25 },
  'wipe-up': { xfade: 'wipeup', duration: 0.22 },
  'smooth-zoom': { xfade: 'fade', duration: 0.2 },
  'fade-white': { xfade: 'fade', duration: 0.18 },
  'flash-white': { xfade: 'fade', duration: 0.12 },
  radial: { xfade: 'fade', duration: 0.2 },
  'circle-open': { xfade: 'fade', duration: 0.2 },
  'diag-wipe': { xfade: 'wipeleft', duration: 0.22 },
  'smooth-left': { xfade: 'slideleft', duration: 0.25 },
  'smooth-right': { xfade: 'slideright', duration: 0.25 },
  'squeeze-h': { xfade: 'fade', duration: 0.18 },
  wind: { xfade: 'fade', duration: 0.2 },
}

export type SceneClip = {
  path: string
  durationSeconds: number
  transition: ReelSceneTransition | 'fadeblack'
  xfadeDuration?: number
}

export function getTransitionSpec(clip: Pick<SceneClip, 'transition' | 'xfadeDuration'>): TransitionSpec {
  if (clip.transition === 'fadeblack') {
    return { xfade: 'fadeblack', duration: clip.xfadeDuration ?? ENTRANCE_XFADE_SEC }
  }
  return TRANSITION_SPECS[clip.transition as ReelSceneTransition] ?? TRANSITION_SPECS.fade
}

export function buildBookendedSceneClips(
  sceneClips: Array<{ path: string; durationSeconds: number; transition: ReelSceneTransition }>,
  blackLeaderPath: string,
  blackTailPath: string,
): SceneClip[] {
  if (!sceneClips.length) return []

  const bookended: SceneClip[] = [
    { path: blackLeaderPath, durationSeconds: BLACK_LEADER_SEC, transition: 'fade' },
    {
      path: sceneClips[0].path,
      durationSeconds: sceneClips[0].durationSeconds,
      transition: 'fadeblack',
      xfadeDuration: ENTRANCE_XFADE_SEC,
    },
  ]

  for (let index = 1; index < sceneClips.length; index++) {
    bookended.push({
      path: sceneClips[index].path,
      durationSeconds: sceneClips[index].durationSeconds,
      transition: sceneClips[index].transition,
    })
  }

  bookended.push({
    path: blackTailPath,
    durationSeconds: BLACK_TAIL_SEC,
    transition: 'fadeblack',
    xfadeDuration: EXIT_XFADE_SEC,
  })

  return bookended
}

export function exitXfadeDuration() {
  return EXIT_XFADE_SEC
}

export function buildXfadeFilterGraph(scenes: SceneClip[]) {
  if (scenes.length < 2) return null

  const filters: string[] = []
  let lastLabel = '0:v'
  let timeline = scenes[0].durationSeconds

  for (let index = 1; index < scenes.length; index++) {
    const { xfade, duration } = getTransitionSpec(scenes[index])
    const offset = Math.max(0.05, timeline - duration)
    const outLabel = index === scenes.length - 1 ? 'vout' : `vx${index}`

    filters.push(
      `[${lastLabel}][${index}:v]xfade=transition=${xfade}:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`,
    )

    lastLabel = outLabel
    timeline = timeline + scenes[index].durationSeconds - duration
  }

  return filters.join(';')
}

export function estimateMergedDuration(scenes: SceneClip[]) {
  if (!scenes.length) return 0
  let total = scenes[0].durationSeconds
  for (let index = 1; index < scenes.length; index++) {
    total += scenes[index].durationSeconds - getTransitionSpec(scenes[index]).duration
  }
  return total
}

export function mergedOutputPath(workDir: string) {
  return join(workDir, 'merged-xfade.mp4')
}

export async function readSceneClip(path: string) {
  return readFile(path)
}
