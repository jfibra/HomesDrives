import type { ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'
import { REEL_SCALE_FLAGS } from '@/lib/reels-maker/render-quality'
import type { ReelSceneMotion } from '@/lib/reels-maker/types'

const FPS = 30

/** Motions that count as real camera language (never plan majority-static). */
export const CINEMATIC_MOTIONS: ReelSceneMotion[] = [
  'dolly-in',
  'dolly-out',
  'push-in-corner',
  'reveal-from-top',
  'vertical-drift',
  'horizontal-track',
  'float',
  'slow-zoom-in',
  'slow-zoom-out',
  'gentle-pan-left',
  'gentle-pan-right',
]

const LEGACY_ALIASES: Record<string, ReelSceneMotion> = {
  'slow-zoom-in': 'dolly-in',
  'slow-zoom-out': 'dolly-out',
  'gentle-pan-left': 'horizontal-track',
  'gentle-pan-right': 'horizontal-track',
  static: 'float',
}

export function normalizeMotion(motion: string | null | undefined): ReelSceneMotion {
  if (!motion) return 'dolly-in'
  if ((CINEMATIC_MOTIONS as string[]).includes(motion)) return motion as ReelSceneMotion
  return LEGACY_ALIASES[motion] ?? 'dolly-in'
}

export function buildPreScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.preScaleWidth}:${frame.preScaleHeight}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.preScaleWidth}:${frame.preScaleHeight}`
}

export function buildStaticScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.width}:${frame.height},fps=${FPS}`
}

/** Ease-in-out cubic from frame index `on`. */
function easeExpr(frames: number) {
  const t = `on/${frames}`
  return `((${t})*(${t})*(3-2*(${t})))`
}

/**
 * Map motion vocabulary → zoompan recipes.
 * Stronger Z/pans than classic ±6% Ken Burns, still subtle enough for luxury.
 */
export function buildMotionFilter(
  motion: ReelSceneMotion,
  durationSeconds: number,
  frame: ReelFrameDimensions,
): string {
  const preScale = buildPreScale(frame)
  const frames = Math.max(1, Math.round(durationSeconds * FPS))
  const ease = easeExpr(frames)
  const size = `s=${frame.width}x${frame.height}:fps=${FPS}:d=${frames}`
  const resolved = normalizeMotion(motion)

  switch (resolved) {
    case 'dolly-out':
    case 'slow-zoom-out': {
      const z = `1.12-0.12*${ease}`
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${size}`
    }
    case 'push-in-corner': {
      const z = `1.0+0.14*${ease}`
      // Bias toward upper-right / architectural interest
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*(0.15+0.55*${ease})':y='(ih-ih/zoom)*(0.12+0.28*${ease})':${size}`
    }
    case 'reveal-from-top': {
      const z = `1.08`
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*${ease}':${size}`
    }
    case 'vertical-drift': {
      const z = `1.06+0.04*${ease}`
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-${ease})':${size}`
    }
    case 'horizontal-track':
    case 'gentle-pan-left':
    case 'gentle-pan-right': {
      const z = `1.08`
      const goingRight = resolved === 'gentle-pan-right' || (resolved === 'horizontal-track' && frames % 2 === 0)
      const x = goingRight ? `(iw-iw/zoom)*${ease}` : `(iw-iw/zoom)*(1-${ease})`
      return `${preScale},zoompan=z='${z}':x='${x}':y='ih/2-(ih/zoom/2)':${size}`
    }
    case 'float': {
      // Micro handheld — tiny Z pulse + lateral drift
      const z = `1.04+0.03*sin(2*PI*on/${frames})`
      const x = `iw/2-(iw/zoom/2)+(iw*0.012)*sin(2*PI*on/${Math.max(8, Math.round(frames * 0.7))})`
      const y = `ih/2-(ih/zoom/2)+(ih*0.008)*cos(2*PI*on/${Math.max(10, Math.round(frames * 0.85))})`
      return `${preScale},zoompan=z='${z}':x='${x}':y='${y}':${size}`
    }
    case 'dolly-in':
    case 'slow-zoom-in':
    default: {
      const z = `1.0+0.12*${ease}`
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':${size}`
    }
  }
}

/** Light push for video clips so they aren't locked static. Uses crop (zoompan is flaky on video). */
export function buildVideoMotionFilter(durationSeconds: number, frame: ReelFrameDimensions): string {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  const overW = Math.round(frame.width * 1.08)
  const overH = Math.round(frame.height * 1.08)
  const dur = Math.max(0.5, durationSeconds)
  // Ease crop center → slight push-in
  const x = `(iw-ow)/2*(1-min(1\\,t/${dur}))`
  const y = `(ih-oh)/2*(1-min(1\\,t/${dur}))`
  return [
    `scale=${overW}:${overH}:force_original_aspect_ratio=increase:${scaleFlags}`,
    `crop=${overW}:${overH}`,
    `crop=${frame.width}:${frame.height}:${x}:${y}`,
    `fps=${FPS}`,
  ].join(',')
}

/**
 * Pick a motion that does not match the previous scene.
 * Index-aware rotation for deterministic luxury pacing.
 */
export function pickCinematicMotion(index: number, previous?: ReelSceneMotion | null): ReelSceneMotion {
  const palette: ReelSceneMotion[] = [
    'dolly-in',
    'horizontal-track',
    'push-in-corner',
    'float',
    'reveal-from-top',
    'dolly-out',
    'vertical-drift',
    'float',
  ]
  let pick = palette[index % palette.length]
  if (previous && normalizeMotion(pick) === normalizeMotion(previous)) {
    pick = palette[(index + 3) % palette.length]
  }
  if (previous && normalizeMotion(pick) === normalizeMotion(previous)) {
    pick = palette[(index + 5) % palette.length]
  }
  return pick
}

export function ensureNoRepeatMotions(motions: ReelSceneMotion[]): ReelSceneMotion[] {
  const result: ReelSceneMotion[] = []
  const used = new Set<ReelSceneMotion>()
  for (let i = 0; i < motions.length; i++) {
    let next = normalizeMotion(motions[i])
    const prev = result[i - 1]
    let guard = 0
    while (
      guard < CINEMATIC_MOTIONS.length + 2 &&
      ((prev && next === prev) || (used.has(next) && used.size < CINEMATIC_MOTIONS.length))
    ) {
      next = pickCinematicMotion(i + guard + 3, prev)
      guard += 1
    }
    result.push(next)
    used.add(next)
  }
  return result
}
