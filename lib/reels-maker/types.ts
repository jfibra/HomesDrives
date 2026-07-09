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

export type ReelLogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

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

export type ReelScenePlan = {
  mediaId: string
  durationSeconds: number
  transition: ReelSceneTransition
  motion: 'slow-zoom-in' | 'slow-zoom-out' | 'gentle-pan-left' | 'gentle-pan-right' | 'static'
  textOverlay?: string | null
  captionLine?: string | null
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
  voiceOverEnabled: boolean
  outroEnabled: boolean
  outroLine: string
  reelBrief: string
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
  qrEnabled: boolean
  qrBucketName: string | null
  qrStoragePath: string | null
  qrPublicUrl: string | null
  qrPosition: ReelLogoPosition
  resultUrl: string | null
  error: string | null
}

export type CreateReelJobInput = {
  templateId: ReelTemplateId
  aspectRatio?: ReelAspectRatio
  voiceOverEnabled: boolean
  outroEnabled?: boolean
  outroLine?: string
  reelBrief?: string
  customCaption?: string
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
