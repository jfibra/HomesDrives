import type { ReelAspectRatio } from '@/lib/reels-maker/aspect-ratio'

export type { ReelAspectRatio }

export type ReelTemplateId =
  | 'cinematic'
  | 'luxury'
  | 'modern'
  | 'real-estate'
  | 'travel'
  | 'family'
  | 'event'
  | 'birthday'
  | 'wedding'
  | 'minimal'
  | 'social-trend'
  | 'listing-showcase'

export type ReelJobStatus =
  | 'queued'
  | 'uploading'
  | 'analyzing'
  | 'generating_story'
  | 'writing_captions'
  | 'creating_voiceover'
  | 'rendering'
  | 'uploading_result'
  | 'completed'
  | 'failed'

export type ReelMediaKind = 'image' | 'video'

export type ReelLogoPosition =
  | 'top-left'
  | 'top-right'
  | 'top-center'
  | 'bottom-left'
  | 'bottom-right'
  | 'bottom-center'

/** When an overlay (logo / QR) appears on the final video.
 * - `always` — photo-tour watermark; if a branded mascot outro is built, watermark is
 *   auto-masked off outro frames (no stacking on the plate logo). Same visual as `photos-only`
 *   whenever the branded outro is present.
 * - `photos-only` — watermark on photo tour only; outro plate still uses uploaded `logo` once.
 * - `outro-only` — no photo watermark; logo/QR only on the outro window / plate.
 */
export type ReelOverlayDisplay = 'always' | 'photos-only' | 'outro-only'

/** Gemini TTS narrator gender for voice-over. */
export type ReelVoiceGender = 'man' | 'woman'

/**
 * Delivery format:
 * - `reels` — portrait (9:16) short-form + portrait mascot outro
 * - `youtube` — landscape (16:9) + YouTube landscape mascot/QR outro
 */
export type ReelOutputFormat = 'reels' | 'youtube'

/**
 * Photo-tour camera intensity:
 * - `cinematic` — mild Ken Burns pans (default for reels)
 * - `subtle` — very light pan / low zoom (default for youtube)
 * - `off` — static framed stills, no push/zoom
 */
export type ReelCameraMotion = 'cinematic' | 'subtle' | 'off'

export type ReelUploadedMedia = {
  id: string
  kind: ReelMediaKind
  fileName: string
  mimeType: string
  bucketName: string
  storagePath: string
  publicUrl: string
  width: number | null
  height: number | null
  durationSeconds: number | null
  qualityScore: number
  rejected: boolean
  rejectReason?: string
  userNote?: string
}

export type ReelSceneTransition =
  | 'fade'
  | 'cross-dissolve'
  | 'cut'
  | 'zoom-cut'
  | 'slide-left'
  | 'slide-right'
  | 'wipe-up'
  | 'smooth-zoom'
  | 'fade-white'
  | 'flash-white'
  | 'radial'
  | 'circle-open'
  | 'diag-wipe'
  | 'smooth-left'
  | 'smooth-right'
  | 'squeeze-h'
  | 'wind'

/** Luxury camera language — legacy Ken Burns names remain as aliases. */
export type ReelSceneMotion =
  | 'dolly-in'
  | 'dolly-out'
  | 'push-in-corner'
  | 'reveal-from-top'
  | 'vertical-drift'
  | 'horizontal-track'
  | 'float'
  | 'slow-zoom-in'
  | 'slow-zoom-out'
  | 'gentle-pan-left'
  | 'gentle-pan-right'
  | 'static'

export type ReelSceneRole = 'hook' | 'hero' | 'detail' | 'lifestyle' | 'closing'

export type ReelScenePlan = {
  mediaId: string
  durationSeconds: number
  transition: ReelSceneTransition
  motion: ReelSceneMotion
  sceneRole?: ReelSceneRole
  textOverlay?: string | null
  captionLine?: string | null
  /** Listing Showcase only: persistent price lower-third, replaces textOverlay/captionLine rendering when set. */
  listingPriceText?: string | null
  listingFactsLines?: string[] | null
}

export type ReelStoryPlan = {
  title: string
  templateId: ReelTemplateId
  mood: string
  scenes: ReelScenePlan[]
  voiceOverScript: string
  suggestedHashtags: string[]
  musicMood: string
  pacingNotes: string
}

export type ReelJob = {
  id: string
  status: ReelJobStatus
  progress: number
  message: string
  createdAt: string
  updatedAt: string
  templateId: ReelTemplateId
  aspectRatio: ReelAspectRatio
  /** `reels` (default) or `youtube` (landscape + YouTube outro plate). */
  outputFormat: ReelOutputFormat
  /** Photo-tour motion. YouTube defaults to `subtle`. */
  cameraMotion: ReelCameraMotion
  voiceOverEnabled: boolean
  /** Narrator gender for TTS — `woman` (default) or `man`. */
  voiceGender: ReelVoiceGender
  /** When false, skips legacy karaoke caption generation. Bottom scene titles still render. */
  captionsEnabled: boolean
  outroEnabled: boolean
  outroLine: string
  reelBrief: string
  /** YouTube outro primary line (falls back to listingAddress / plan title). */
  listingTitle: string
  /** YouTube outro secondary line (falls back to price · beds/baths · address bits). */
  listingDetails: string
  caption: string
  hashtags: string[]
  voiceOverScript: string
  plan: ReelStoryPlan | null
  media: ReelUploadedMedia[]
  musicBucketName: string | null
  musicStoragePath: string | null
  logoEnabled: boolean
  logoBucketName: string | null
  logoStoragePath: string | null
  logoPublicUrl: string | null
  logoPosition: ReelLogoPosition
  logoDisplay: ReelOverlayDisplay
  /** Optional second mark for the left blue logo tab on the lower-third (beside the title). */
  accentLogoEnabled: boolean
  accentLogoBucketName: string | null
  accentLogoStoragePath: string | null
  accentLogoPublicUrl: string | null
  qrEnabled: boolean
  qrBucketName: string | null
  qrStoragePath: string | null
  qrPublicUrl: string | null
  qrPosition: ReelLogoPosition
  qrDisplay: ReelOverlayDisplay
  agentHeadshotEnabled: boolean
  agentHeadshotBucketName: string | null
  agentHeadshotStoragePath: string | null
  agentHeadshotPublicUrl: string | null
  listingPrice: string
  listingAddress: string
  listingBeds: string
  listingBaths: string
  listingSqft: string
  listingUrl: string
  agentName: string
  agentPhone: string
  agentEmail: string
  agentAgencyName: string
  resultUrl: string | null
  error: string | null
}

export type CreateReelJobInput = {
  templateId: ReelTemplateId
  aspectRatio?: ReelAspectRatio
  /** Default `reels`. Use `youtube` for 16:9 + YouTube outro. */
  outputFormat?: ReelOutputFormat
  /** Default `cinematic` for reels, `subtle` for youtube. */
  cameraMotion?: ReelCameraMotion
  voiceOverEnabled: boolean
  /** Default `woman`. Set `man` for a male narrator. Aliases: `male` / `female`. */
  voiceGender?: ReelVoiceGender | 'male' | 'female'
  /** Default true. Set false to omit burned-in bottom captions. Alias: `subtitlesEnabled`. */
  captionsEnabled?: boolean
  /** Alias for captionsEnabled — either false turns burn-in off. */
  subtitlesEnabled?: boolean
  outroEnabled?: boolean
  outroLine?: string
  reelBrief?: string
  customCaption?: string
  listingTitle?: string
  listingDetails?: string
  listingPrice?: string
  listingAddress?: string
  listingBeds?: string
  listingBaths?: string
  listingSqft?: string
  listingUrl?: string
  agentName?: string
  agentPhone?: string
  agentEmail?: string
  agentAgencyName?: string
}

export type ReelDraftSummary = {
  id: string
  status: ReelJobStatus
  title: string
  caption: string
  templateId: ReelTemplateId
  resultUrl: string | null
  thumbnailUrl: string | null
  mediaCount: number
  createdAt: string
  updatedAt: string
  error: string | null
}
