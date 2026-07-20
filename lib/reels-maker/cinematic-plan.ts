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
  // Slightly over 2s so soft ~0.5s blends still leave ~2s of clear photo
  return 2.35
}

/** Continuity-aware transition — soft cinematic blends matched to pan direction. */
export function chooseTransition(params: {
  index: number
  previousMotion?: ReelSceneMotion | null
  nextRole: ReelSceneRole
  previousTransition?: ReelSceneTransition | null
}): ReelSceneTransition {
  const { index, previousMotion, nextRole, previousTransition } = params
  const prev = previousMotion ? normalizeMotion(previousMotion) : null

  const softCycle: ReelSceneTransition[] = [
    'cross-dissolve',
    'smooth-left',
    'fade',
    'smooth-right',
    'slide-left',
    'wipe-up',
    'slide-right',
    'smooth-zoom',
  ]

  let preferred: ReelSceneTransition
  if (nextRole === 'closing') preferred = 'cross-dissolve'
  else if (prev === 'gentle-pan-left' || prev === 'horizontal-track') preferred = 'smooth-left'
  else if (prev === 'gentle-pan-right') preferred = 'smooth-right'
  else if (prev === 'reveal-from-top') preferred = 'wipe-up'
  else if (prev === 'vertical-drift') preferred = 'smooth-zoom'
  else preferred = softCycle[index % softCycle.length]

  // Never hard-cut between photos — always blend
  if (preferred === 'cut') preferred = 'cross-dissolve'

  if (previousTransition && preferred === previousTransition) {
    preferred = softCycle[(index + 3) % softCycle.length]
  }
  return preferred
}

/** YouTube landscape: alternate horizontal wipes between photos (right → left → right …). */
export function chooseYoutubeTransition(index: number, previous?: ReelSceneTransition | null): ReelSceneTransition {
  // index = scene index receiving the transition (1 = first photo-to-photo cut)
  const next: ReelSceneTransition = index % 2 === 1 ? 'slide-right' : 'slide-left'
  if (previous && previous === next) {
    return next === 'slide-left' ? 'slide-right' : 'slide-left'
  }
  return next
}

/** Force left/right slide transitions on every photo cut (keeps scene 0 entrance unchanged). */
export function applyYoutubeSlideTransitions(plan: ReelStoryPlan): ReelStoryPlan {
  if (plan.scenes.length < 2) return plan

  let previous: ReelSceneTransition | null = null
  const scenes = plan.scenes.map((scene, index) => {
    if (index === 0) return scene
    const transition = chooseYoutubeTransition(index, previous)
    previous = transition
    return { ...scene, transition }
  })

  return {
    ...plan,
    scenes,
    pacingNotes:
      plan.pacingNotes ||
      'Horizontal slide transitions between listing photos (alternating left ↔ right).',
  }
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
      'Directional pans with soft dissolve / smooth slide transitions between photos.',
  }
}

function clampSceneDurations(scenes: ReelScenePlan[]): ReelScenePlan[] {
  return scenes.map((scene) => ({
    ...scene,
    durationSeconds: Number(Math.max(2.35, scene.durationSeconds > 0 ? scene.durationSeconds : 2.35).toFixed(2)),
  }))
}

export function pickLuxuryTransition(index: number): ReelSceneTransition {
  return ALL_TRANSITIONS[index % ALL_TRANSITIONS.length]
}
