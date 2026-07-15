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
  hook: { min: 2.0, max: 2.0 },
  hero: { min: 2.0, max: 2.0 },
  detail: { min: 2.0, max: 2.0 },
  lifestyle: { min: 2.0, max: 2.0 },
  closing: { min: 2.0, max: 2.0 },
}

void ROLE_DURATION

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

function durationForRole(_role: ReelSceneRole, _index: number): number {
  void _role
  void _index
  // Hard hold — every photo stays exactly 2 seconds
  return 2.0
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
  else if (nextRole === 'hook') preferred = 'cut'
  else if (prev === 'gentle-pan-left' || prev === 'horizontal-track') preferred = 'slide-left'
  else if (prev === 'gentle-pan-right') preferred = 'slide-right'
  else if (prev === 'reveal-from-top') preferred = 'wipe-up'
  else if (prev === 'vertical-drift') preferred = 'fade'
  else preferred = index % 2 === 0 ? 'fade' : 'cross-dissolve'

  if (previousTransition && preferred === previousTransition) {
    preferred = preferred === 'fade' ? 'cross-dissolve' : 'fade'
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
    return {
      ...scene,
      sceneRole: role,
      motion,
      // Prefer short cuts so the 2s hold isn't eaten by long crossfades
      transition: index === 0 ? 'cut' : transition === 'cut' ? 'fade' : transition,
      durationSeconds: 2.0,
    }
  })

  scenes = clampSceneDurations(scenes)

  return {
    ...plan,
    scenes,
    pacingNotes:
      plan.pacingNotes ||
      '2s holds with straight L/R and T/B pans — no circular camera drift.',
  }
}

function clampSceneDurations(scenes: ReelScenePlan[]): ReelScenePlan[] {
  return scenes.map((scene) => ({
    ...scene,
    durationSeconds: 2.0,
  }))
}

export function pickLuxuryTransition(index: number): ReelSceneTransition {
  return ALL_TRANSITIONS[index % ALL_TRANSITIONS.length]
}
