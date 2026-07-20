import type { ReelFrameDimensions } from '@/lib/reels-maker/aspect-ratio'
import { REEL_SCALE_FLAGS } from '@/lib/reels-maker/render-quality'
import type { ReelSceneMotion } from '@/lib/reels-maker/types'

const FPS = 30

/**
 * Straight directional pans only (no circular / orbital float).
 * View pans: left↔right and top↔bottom at a gentle fixed zoom.
 */
export const DIRECTIONAL_MOTIONS: ReelSceneMotion[] = [
  'gentle-pan-left', // right → left
  'gentle-pan-right', // left → right
  'reveal-from-top', // top → bottom
  'vertical-drift', // bottom → top
]

/** Full set kept for type compatibility; non-directional names alias into the 4 pans. */
export const CINEMATIC_MOTIONS: ReelSceneMotion[] = [
  ...DIRECTIONAL_MOTIONS,
  'horizontal-track',
  'dolly-in',
  'dolly-out',
  'push-in-corner',
  'float',
  'slow-zoom-in',
  'slow-zoom-out',
  'static',
]

const LEGACY_ALIASES: Record<string, ReelSceneMotion> = {
  'slow-zoom-in': 'gentle-pan-right',
  'slow-zoom-out': 'gentle-pan-left',
  'dolly-in': 'gentle-pan-right',
  'dolly-out': 'gentle-pan-left',
  'push-in-corner': 'reveal-from-top',
  'horizontal-track': 'gentle-pan-left',
  float: 'vertical-drift',
  static: 'gentle-pan-right',
}

export function normalizeMotion(motion: string | null | undefined): ReelSceneMotion {
  if (!motion) return 'gentle-pan-right'
  if ((DIRECTIONAL_MOTIONS as string[]).includes(motion)) return motion as ReelSceneMotion
  if ((CINEMATIC_MOTIONS as string[]).includes(motion)) {
    return LEGACY_ALIASES[motion] ?? (motion as ReelSceneMotion)
  }
  return LEGACY_ALIASES[motion] ?? 'gentle-pan-right'
}

export function buildPreScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.preScaleWidth}:${frame.preScaleHeight}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.preScaleWidth}:${frame.preScaleHeight}`
}

export function buildStaticScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.width}:${frame.height},fps=${FPS}`
}

/** Fit entire image in frame with letterboxing (no crop). Prefer cover for YouTube/full-bleed. */
export function buildContainScale(frame: ReelFrameDimensions) {
  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  return `scale=${frame.width}:${frame.height}:force_original_aspect_ratio=decrease:${scaleFlags},pad=${frame.width}:${frame.height}:(ow-iw)/2:(oh-ih)/2:black,fps=${FPS}`
}

export type MotionIntensity = 'cinematic' | 'subtle' | 'off'

/** Linear progress 0→1 across the scene (smooth, not circular). */
function linearExpr(frames: number) {
  return `min(1\\,on/${Math.max(1, frames - 1)})`
}

/**
 * Map motion → Ken Burns pans. Intensity controls zoom push:
 * - cinematic: ~1.12× zoom through pre-scaled canvas
 * - subtle: ~1.04× (YouTube default — light pan, full-bleed cover crop)
 * - off: static full-bleed cover (no zoompan, no letterbox bars)
 */
export function buildMotionFilter(
  motion: ReelSceneMotion,
  durationSeconds: number,
  frame: ReelFrameDimensions,
  intensity: MotionIntensity = 'cinematic',
): string {
  if (intensity === 'off') {
    return buildStaticScale(frame)
  }

  const preScale = buildPreScale(frame)
  const frames = Math.max(1, Math.round(durationSeconds * FPS))
  const t = linearExpr(frames)
  const size = `s=${frame.width}x${frame.height}:fps=${FPS}:d=${frames}`
  const resolved = normalizeMotion(motion)
  const z = intensity === 'subtle' ? '1.04' : '1.12'

  switch (resolved) {
    case 'gentle-pan-left':
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*(1-${t})':y='ih/2-(ih/zoom/2)':${size}`
    case 'gentle-pan-right':
    case 'horizontal-track':
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*${t}':y='ih/2-(ih/zoom/2)':${size}`
    case 'reveal-from-top':
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*${t}':${size}`
    case 'vertical-drift':
      return `${preScale},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-${t})':${size}`
    default:
      return `${preScale},zoompan=z='${z}':x='(iw-iw/zoom)*${t}':y='ih/2-(ih/zoom/2)':${size}`
  }
}

/** Directional crop push for video clips (no circular motion). */
export function buildVideoMotionFilter(
  durationSeconds: number,
  frame: ReelFrameDimensions,
  motion?: ReelSceneMotion | null,
  intensity: MotionIntensity = 'cinematic',
): string {
  if (intensity === 'off') {
    return buildStaticScale(frame)
  }

  const scaleFlags = `flags=${REEL_SCALE_FLAGS}`
  const zoom = intensity === 'subtle' ? 1.04 : 1.12
  const overW = Math.round(frame.width * zoom)
  const overH = Math.round(frame.height * zoom)
  const dur = Math.max(0.5, durationSeconds)
  const resolved = normalizeMotion(motion)
  const p = `min(1\\,t/${dur})`

  let x = `(iw-ow)/2`
  let y = `(ih-oh)/2`
  switch (resolved) {
    case 'gentle-pan-left':
      x = `(iw-ow)*(1-${p})`
      break
    case 'gentle-pan-right':
    case 'horizontal-track':
      x = `(iw-ow)*${p}`
      break
    case 'reveal-from-top':
      y = `(ih-oh)*${p}`
      break
    case 'vertical-drift':
      y = `(ih-oh)*(1-${p})`
      break
    default:
      x = `(iw-ow)*${p}`
      break
  }

  return `scale=${overW}:${overH}:force_original_aspect_ratio=increase:${scaleFlags},crop=${frame.width}:${frame.height}:x='${x}':y='${y}',fps=${FPS}`
}

/** Rotate: L→R, R→L, T→B, B→T — never the same twice in a row. */
export function pickCinematicMotion(index: number, previous?: ReelSceneMotion | null): ReelSceneMotion {
  const palette = DIRECTIONAL_MOTIONS
  let pick = palette[index % palette.length]
  if (previous && normalizeMotion(pick) === normalizeMotion(previous)) {
    pick = palette[(index + 1) % palette.length]
  }
  return pick
}

export function ensureNoRepeatMotions(motions: ReelSceneMotion[]): ReelSceneMotion[] {
  const result: ReelSceneMotion[] = []
  for (let i = 0; i < motions.length; i++) {
    let next = normalizeMotion(motions[i])
    const prev = result[i - 1]
    if (prev && next === prev) {
      next = pickCinematicMotion(i + 1, prev)
    }
    // Prefer the deterministic directional sequence
    if (!DIRECTIONAL_MOTIONS.includes(next)) {
      next = pickCinematicMotion(i, prev)
    }
    result.push(next)
  }
  return result
}
