import { pickCinematicMotion, ensureNoRepeatMotions, normalizeMotion } from '@/lib/reels-maker/cinematic-motion'
import type {
  ReelSceneMotion,
  ReelScenePlan,
  ReelSceneRole,
  ReelSceneTransition,
  ReelStoryPlan,
  ReelUploadedMedia,
} from '@/lib/reels-maker/types'

const ROLE_DURATION: Record<ReelSceneRole, { min: number; max: number }> = {
  hook: { min: 2.0, max: 2.4 },
  hero: { min: 3.2, max: 4.0 },
  detail: { min: 1.6, max: 2.4 },
  lifestyle: { min: 1.9, max: 2.2 },
  closing: { min: 2.8, max: 3.5 },
}

const ALL_TRANSITIONS: ReelSceneTransition[] = [
  'cross-dissolve',
  'smooth-left',
  'radial',
  'flash-white',
  'smooth-right',
  'diag-wipe',
  'circle-open',
  'zoom-cut',
  'fade-white',
  'squeeze-h',
  'wind',
  'slide-left',
  'slide-right',
  'wipe-up',
  'fade',
]

function roleForIndex(index: number, total: number): ReelSceneRole {
  if (total <= 1) return 'hero'
  if (index === 0) return 'hook'
  if (index === total - 1) return 'closing'
  if (index === 1) return 'hero'
  if (index % 3 === 0) return 'lifestyle'
  return 'detail'
}

function durationForRole(role: ReelSceneRole, index: number): number {
  const band = ROLE_DURATION[role]
  const t = (index % 5) / 5
  return Number((band.min + (band.max - band.min) * t).toFixed(2))
}

/** Continuity-aware transition pick from previous motion → next role. */
export function chooseTransition(params: {
  index: number
  previousMotion?: ReelSceneMotion | null
  nextRole: ReelSceneRole
  previousTransition?: ReelSceneTransition | null
}): ReelSceneTransition {
  const { index, previousMotion, nextRole, previousTransition } = params
  const prev = previousMotion ? normalizeMotion(previousMotion) : null

  let preferred: ReelSceneTransition
  if (nextRole === 'closing') preferred = 'fade'
  else if (nextRole === 'hook') preferred = 'fade-white'
  else if (prev === 'horizontal-track' || prev === 'gentle-pan-left') preferred = 'smooth-left'
  else if (prev === 'gentle-pan-right') preferred = 'smooth-right'
  else if (prev === 'dolly-in' || prev === 'push-in-corner') preferred = index % 2 === 0 ? 'radial' : 'zoom-cut'
  else if (prev === 'reveal-from-top' || prev === 'vertical-drift') preferred = 'wipe-up'
  else if (nextRole === 'detail') preferred = index % 2 === 0 ? 'flash-white' : 'diag-wipe'
  else preferred = ALL_TRANSITIONS[index % ALL_TRANSITIONS.length]

  if (previousTransition && preferred === previousTransition) {
    preferred = ALL_TRANSITIONS[(index + 4) % ALL_TRANSITIONS.length]
  }
  return preferred
}

/** Strongest quality score first for hook; keep variety for the rest. */
export function reorderMediaForStory(media: ReelUploadedMedia[]): ReelUploadedMedia[] {
  if (media.length <= 2) return [...media].sort((a, b) => b.qualityScore - a.qualityScore)

  const ranked = [...media].sort((a, b) => b.qualityScore - a.qualityScore)
  const hook = ranked[0]
  const closing = ranked[1]
  const middle = ranked.slice(2)
  // Interleave remaining by score for visual rhythm
  return [hook, ...middle, closing]
}

export function assignSceneRoles(scenes: ReelScenePlan[]): ReelScenePlan[] {
  const total = scenes.length
  return scenes.map((scene, index) => {
    const role = scene.sceneRole ?? roleForIndex(index, total)
    return {
      ...scene,
      sceneRole: role,
      durationSeconds: scene.durationSeconds > 0 ? scene.durationSeconds : durationForRole(role, index),
    }
  })
}

/** Apply luxury pacing: roles, durations, motion uniqueness, purposeful transitions. */
export function polishCinematicPlan(
  plan: ReelStoryPlan,
  media: ReelUploadedMedia[],
  options?: { preserveDuration?: boolean },
): ReelStoryPlan {
  const mediaById = new Map(media.map((m) => [m.id, m]))
  let scenes = [...plan.scenes]

  // Reorder by quality if scenes follow upload order of weak first frames
  const orderedMedia = reorderMediaForStory(
    scenes.map((s) => mediaById.get(s.mediaId)).filter((m): m is ReelUploadedMedia => Boolean(m)),
  )
  if (orderedMedia.length === scenes.length) {
    const byId = new Map(scenes.map((s) => [s.mediaId, s]))
    scenes = orderedMedia.map((m, index) => {
      const existing = byId.get(m.id)!
      return { ...existing, sceneRole: roleForIndex(index, orderedMedia.length) }
    })
  } else {
    scenes = assignSceneRoles(scenes)
  }

  // Durations from roles (unless caller wants VO scaling to own it later)
  if (!options?.preserveDuration) {
    scenes = scenes.map((scene, index) => ({
      ...scene,
      sceneRole: scene.sceneRole ?? roleForIndex(index, scenes.length),
      durationSeconds: durationForRole(scene.sceneRole ?? roleForIndex(index, scenes.length), index),
    }))
  }

  const motions = ensureNoRepeatMotions(
    scenes.map((scene, index) => normalizeMotion(scene.motion) || pickCinematicMotion(index)),
  )

  scenes = scenes.map((scene, index) => {
    const role = scene.sceneRole ?? roleForIndex(index, scenes.length)
    const motion = motions[index]
    const transition = chooseTransition({
      index,
      previousMotion: index > 0 ? motions[index - 1] : null,
      nextRole: role,
      previousTransition: index > 0 ? scenes[index - 1]?.transition : null,
    })
    // Hook always punches in
    const hookMotion = index === 0 ? (motion === 'dolly-out' ? 'dolly-in' : motion) : motion
    return {
      ...scene,
      sceneRole: role,
      motion: index === 0 ? (hookMotion === 'float' ? 'dolly-in' : hookMotion) : motion,
      transition: index === 0 ? 'cut' : transition,
    }
  })

  return {
    ...plan,
    scenes,
    pacingNotes:
      plan.pacingNotes ||
      'Luxury cinematic pacing: hook punch, varied camera language, purposeful transitions.',
  }
}

export function pickLuxuryTransition(index: number): ReelSceneTransition {
  return ALL_TRANSITIONS[index % ALL_TRANSITIONS.length]
}
