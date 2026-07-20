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

/** Alternating horizontal wipe — right, left, right, left… */
export function pickDirectionalSlideTransition(
  index: number,
  previous?: ReelSceneTransition | null,
): ReelSceneTransition {
  // index 1 = first photo→photo cut; start sliding in from the right
  let pick: ReelSceneTransition = index % 2 === 1 ? 'slide-right' : 'slide-left'
  if (previous && pick === previous) {
    pick = pick === 'slide-right' ? 'slide-left' : 'slide-right'
  }
  return pick
}

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
  // Slightly over 2s so soft ~0.5s blends still leave ~2s of clear photo
  return 2.35
}

/** Photo-to-photo transition — horizontal slides, alternating direction. */
export function chooseTransition(params: {
  index: number
  previousMotion?: ReelSceneMotion | null
  nextRole: ReelSceneRole
  previousTransition?: ReelSceneTransition | null
}): ReelSceneTransition {
  const { index, previousMotion, previousTransition } = params
  const prev = previousMotion ? normalizeMotion(previousMotion) : null

  // Match incoming pan direction when it is clearly horizontal
  let preferred: ReelSceneTransition
  if (prev === 'gentle-pan-left' || prev === 'horizontal-track') {
    preferred = 'slide-left'
  } else if (prev === 'gentle-pan-right') {
    preferred = 'slide-right'
  } else {
    preferred = pickDirectionalSlideTransition(index, previousTransition ?? null)
  }

  if (previousTransition && preferred === previousTransition) {
    preferred = preferred === 'slide-right' ? 'slide-left' : 'slide-right'
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
      transition,
      // 2.35s clip + ~0.5s blend ≈ ~2s of clear photo before the next wipe begins
      durationSeconds: 2.35,
    }
  })

  scenes = clampSceneDurations(scenes)

  return {
    ...plan,
    scenes,
    pacingNotes:
      plan.pacingNotes ||
      'Directional pans with alternating left/right slide transitions between photos.',
  }
}

function clampSceneDurations(scenes: ReelScenePlan[]): ReelScenePlan[] {
  return scenes.map((scene) => ({
    ...scene,
    durationSeconds: Number(Math.max(2.35, scene.durationSeconds > 0 ? scene.durationSeconds : 2.35).toFixed(2)),
  }))
}

export function pickLuxuryTransition(index: number): ReelSceneTransition {
  return pickDirectionalSlideTransition(index)
}
