import type { ReelTemplateId } from '@/lib/reels-maker/types'

type Grade = {
  contrast: number
  brightness: number
  saturation: number
  gamma: number
  gammaR: number
  gammaB: number
  sharpness: number
}

// Per-template color grades: contrast, warmth/coolness (gammaR/B), saturation, sharpness
const GRADES: Record<ReelTemplateId, Grade> = {
  cinematic:      { contrast: 1.08, brightness: 0.01, saturation: 0.93, gamma: 1.00, gammaR: 1.02, gammaB: 0.98, sharpness: 0.9 },
  luxury:         { contrast: 1.10, brightness: 0.03, saturation: 1.05, gamma: 1.02, gammaR: 1.04, gammaB: 0.96, sharpness: 1.0 },
  modern:         { contrast: 1.12, brightness: 0.01, saturation: 1.00, gamma: 0.97, gammaR: 1.00, gammaB: 1.00, sharpness: 1.2 },
  'real-estate':  { contrast: 1.08, brightness: 0.04, saturation: 1.10, gamma: 1.03, gammaR: 1.03, gammaB: 0.97, sharpness: 0.9 },
  travel:         { contrast: 1.10, brightness: 0.03, saturation: 1.22, gamma: 0.96, gammaR: 1.00, gammaB: 1.00, sharpness: 1.1 },
  family:         { contrast: 1.05, brightness: 0.04, saturation: 1.08, gamma: 1.05, gammaR: 1.03, gammaB: 0.97, sharpness: 0.7 },
  event:          { contrast: 1.14, brightness: 0.02, saturation: 1.15, gamma: 0.96, gammaR: 1.00, gammaB: 1.00, sharpness: 1.0 },
  birthday:       { contrast: 1.10, brightness: 0.03, saturation: 1.15, gamma: 1.00, gammaR: 1.03, gammaB: 0.97, sharpness: 0.9 },
  wedding:        { contrast: 1.04, brightness: 0.06, saturation: 0.90, gamma: 1.08, gammaR: 1.04, gammaB: 0.96, sharpness: 0.6 },
  minimal:        { contrast: 1.06, brightness: 0.01, saturation: 0.88, gamma: 1.02, gammaR: 1.00, gammaB: 1.00, sharpness: 1.0 },
  'social-trend': { contrast: 1.18, brightness: 0.02, saturation: 1.22, gamma: 0.93, gammaR: 1.00, gammaB: 1.00, sharpness: 1.3 },
}

export function buildColorGradeFilter(templateId: ReelTemplateId): string {
  const g = GRADES[templateId] ?? GRADES.cinematic
  const eq = `eq=contrast=${g.contrast.toFixed(2)}:brightness=${g.brightness.toFixed(2)}:saturation=${g.saturation.toFixed(2)}:gamma=${g.gamma.toFixed(2)}:gamma_r=${g.gammaR.toFixed(2)}:gamma_b=${g.gammaB.toFixed(2)}`
  if (g.sharpness > 0) {
    return `${eq},unsharp=lx=3:ly=3:la=${g.sharpness.toFixed(2)}:cx=3:cy=3:ca=0`
  }
  return eq
}
