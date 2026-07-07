'use client'

import type { RefObject } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Film,
  GripVertical,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mic,
  Music2,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { REEL_TEMPLATES } from '@/lib/reels-maker/templates'
import type { ReelJob, ReelLogoPosition, ReelTemplateId } from '@/lib/reels-maker/types'
import { cn } from '@/lib/utils'

type YouTubeTrackPreview = {
  videoId: string
  title: string
  durationSeconds: number | null
  thumbnailUrl: string | null
  channel: string | null
}

type LocalMedia = {
  id: string
  file: File
  previewUrl: string
  kind: 'image' | 'video'
  note: string
}

type StepDefinition = {
  id: number
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

const STEPS: StepDefinition[] = [
  { id: 1, label: 'Story', shortLabel: 'Story', description: 'Brief & visual style', icon: Sparkles },
  { id: 2, label: 'Media', shortLabel: 'Media', description: 'Photos & video clips', icon: ImageIcon },
  { id: 3, label: 'Music', shortLabel: 'Music', description: 'Background soundtrack', icon: Music2 },
  { id: 4, label: 'Voice & Brand', shortLabel: 'Voice', description: 'Narration, logo & caption', icon: Mic },
  { id: 5, label: 'Generate', shortLabel: 'Export', description: 'Review & export your Reel', icon: Film },
]

const LOGO_POSITION_OPTIONS: Array<{ value: ReelLogoPosition; label: string }> = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
]

type ReelsMakerCreateFlowProps = {
  activeStep: number
  setActiveStep: (step: number) => void
  currentStepDef: StepDefinition
  StepIcon: LucideIcon
  goToNextStep: () => void
  goToPreviousStep: () => void
  reelBrief: string
  setReelBrief: (value: string) => void
  templateId: ReelTemplateId
  setTemplateId: (value: ReelTemplateId) => void
  media: LocalMedia[]
  draggingId: string | null
  setDraggingId: (id: string | null) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void
  onFilesSelected: (fileList: FileList | null) => void
  removeMedia: (id: string) => void
  updateMediaNote: (id: string, note: string) => void
  reorderMedia: (sourceId: string, targetId: string) => void
  musicFile: File | null
  musicInputRef: RefObject<HTMLInputElement | null>
  setMusicFile: (file: File | null) => void
  youtubeMusicUrl: string
  setYoutubeMusicUrl: (value: string) => void
  youtubePreview: YouTubeTrackPreview | null
  isLoadingYoutube: boolean
  youtubeError: string
  setYoutubePreview: (value: YouTubeTrackPreview | null) => void
  setYoutubeError: (value: string) => void
  handleLoadYoutubeMusic: () => void
  clearUploadedMusic: () => void
  voiceOverEnabled: boolean
  setVoiceOverEnabled: (value: boolean) => void
  outroEnabled: boolean
  setOutroEnabled: (value: boolean) => void
  outroLine: string
  setOutroLine: (value: string) => void
  caption: string
  setCaption: (value: string) => void
  logoFile: File | null
  logoPreviewUrl: string | null
  logoEnabled: boolean
  setLogoEnabled: (value: boolean) => void
  logoPosition: ReelLogoPosition
  setLogoPosition: (value: ReelLogoPosition) => void
  logoInputRef: RefObject<HTMLInputElement | null>
  onLogoSelected: (fileList: FileList | null) => void
  clearLogo: () => void
  getTemplateLabel: (templateId: ReelTemplateId) => string
  job: ReelJob | null
  jobId: string | null
  error: string
  isWorking: boolean
  isProcessing: boolean
  handleGenerate: () => void
  handleShare: () => void
  statusLabels: Record<ReelJob['status'], string>
  videoPlaybackUrl: string | null
}

function ReelsHorizontalStepper({
  activeStep,
  setActiveStep,
  job,
}: {
  activeStep: number
  setActiveStep: (step: number) => void
  job: ReelJob | null
}) {
  return (
    <nav
      aria-label="Reel creation progress"
      className="overflow-x-auto rounded-2xl border bg-white px-4 py-6 shadow-sm sm:px-8"
      style={{ borderColor: 'var(--ds-outline-variant)' }}
    >
      <ol className="flex min-w-[36rem] items-start">
        {STEPS.map((step, index) => {
          const isCompleted =
            step.id < activeStep || Boolean(job?.resultUrl && step.id === STEPS.length)
          const isActive = step.id === activeStep && !isCompleted
          const isLast = index === STEPS.length - 1

          return (
            <li key={step.id} className={cn('flex items-start', !isLast && 'flex-1')}>
              <button
                type="button"
                onClick={() => setActiveStep(step.id)}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${step.id}: ${step.label}`}
                className="group flex w-full flex-col items-center gap-2.5 px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-lg"
                style={{ ['--tw-ring-color' as string]: 'var(--ds-primary)' }}
              >
                <div className="relative flex h-10 w-10 items-center justify-center">
                  {isActive ? (
                    <span
                      className="absolute inset-0 rounded-full opacity-30"
                      style={{ backgroundColor: 'var(--ds-primary)' }}
                    />
                  ) : null}
                  <span
                    className={cn(
                      'relative z-10 flex h-8 w-8 items-center justify-center rounded-full transition-all',
                      isCompleted || isActive ? 'text-white' : 'border',
                    )}
                    style={
                      isCompleted || isActive
                        ? { backgroundColor: 'var(--ds-primary)' }
                        : {
                            backgroundColor: 'var(--ds-surface-container-low)',
                            borderColor: 'var(--ds-outline-variant)',
                          }
                    }
                  >
                    {isCompleted ? (
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    ) : isActive ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: 'var(--ds-outline)' }}
                      />
                    )}
                  </span>
                </div>

                <div className="space-y-0.5">
                  <p
                    className="text-sm font-semibold leading-none"
                    style={{
                      color: isActive
                        ? 'var(--ds-primary)'
                        : isCompleted
                          ? 'var(--ds-on-surface)'
                          : 'var(--ds-on-surface)',
                    }}
                  >
                    Step {step.id}
                  </p>
                  <p
                    className="text-xs leading-snug sm:text-sm"
                    style={{
                      color: isActive
                        ? 'color-mix(in srgb, var(--ds-primary) 75%, var(--ds-on-surface-variant))'
                        : 'var(--ds-on-surface-variant)',
                    }}
                  >
                    {step.shortLabel}
                  </p>
                </div>
              </button>

              {!isLast ? (
                <div
                  aria-hidden
                  className="mt-5 h-[3px] min-w-[1rem] flex-1 rounded-full transition-colors duration-300"
                  style={{
                    backgroundColor:
                      step.id < activeStep ? 'var(--ds-primary)' : 'var(--ds-outline-variant)',
                  }}
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function ReelsMakerCreateFlow(props: ReelsMakerCreateFlowProps) {
  const {
    activeStep,
    setActiveStep,
    currentStepDef,
    StepIcon,
    goToNextStep,
    goToPreviousStep,
    reelBrief,
    setReelBrief,
    templateId,
    setTemplateId,
    media,
    draggingId,
    setDraggingId,
    fileInputRef,
    onDrop,
    onFilesSelected,
    removeMedia,
    updateMediaNote,
    reorderMedia,
    musicFile,
    musicInputRef,
    setMusicFile,
    youtubeMusicUrl,
    setYoutubeMusicUrl,
    youtubePreview,
    isLoadingYoutube,
    youtubeError,
    setYoutubePreview,
    setYoutubeError,
    handleLoadYoutubeMusic,
    clearUploadedMusic,
    voiceOverEnabled,
    setVoiceOverEnabled,
    outroEnabled,
    setOutroEnabled,
    outroLine,
    setOutroLine,
    caption,
    setCaption,
    logoFile,
    logoPreviewUrl,
    logoEnabled,
    setLogoEnabled,
    logoPosition,
    setLogoPosition,
    logoInputRef,
    onLogoSelected,
    clearLogo,
    getTemplateLabel,
    job,
    jobId,
    error,
    isWorking,
    isProcessing,
    handleGenerate,
    handleShare,
    statusLabels,
    videoPlaybackUrl,
  } = props

  return (
    <div className="space-y-6">
      <ReelsHorizontalStepper activeStep={activeStep} job={job} setActiveStep={setActiveStep} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <div
          className="overflow-hidden rounded-2xl border bg-white shadow-sm"
          style={{ borderColor: 'var(--ds-outline-variant)' }}
        >
          <div
            className="border-b px-6 py-5 md:px-8"
            style={{ borderColor: 'var(--ds-outline-variant)', backgroundColor: 'var(--ds-surface-container-low)' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: 'var(--ds-primary)' }}
              >
                <StepIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--ds-on-surface)' }}>
                  {currentStepDef.label}
                </h2>
                <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                  {currentStepDef.description}
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 md:px-8 md:py-8">
            {activeStep === 1 ? (
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--ds-primary)' }} />
                    <div className="space-y-1">
                      <p className="font-semibold">Describe your Reel</p>
                      <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        Tell the AI what this reel is about. It will read your photos, enhance your notes, and build
                        captions, voice-over, and story flow.
                      </p>
                    </div>
                  </div>
                  <Textarea
                    id="reel-brief"
                    onChange={(event) => setReelBrief(event.target.value)}
                    placeholder={`Example:\n3BR condo in BGC, ₱12.5M, modern minimalist style.\nHighlight the living room, kitchen, and city view balcony.\nTone: luxury but warm. Target: young professionals.`}
                    rows={6}
                    value={reelBrief}
                  />
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-on-surface-variant)' }}>
                    Visual style
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {REEL_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        className={cn(
                          'rounded-xl border px-3 py-3 text-left transition',
                          templateId === template.id ? 'ring-2' : 'hover:bg-slate-50',
                        )}
                        onClick={() => setTemplateId(template.id)}
                        style={{
                          borderColor: 'var(--ds-outline-variant)',
                          ...(templateId === template.id
                            ? { ringColor: 'var(--ds-primary)', backgroundColor: 'var(--ds-surface-container)' }
                            : {}),
                        }}
                        type="button"
                      >
                        <div className="font-semibold">{template.label}</div>
                        <div className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                          {template.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {activeStep === 2 ? (
              <div className="space-y-6">
                <div
                  className="rounded-2xl border border-dashed p-6"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDrop}
                  style={{ borderColor: 'var(--ds-outline-variant)' }}
                >
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Upload className="h-8 w-8" style={{ color: 'var(--ds-primary)' }} />
                    <div>
                      <p className="font-semibold">Drag and drop photos or short videos</p>
                      <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        JPG, PNG, WEBP, MP4, MOV — add a short note under each photo so AI knows what to highlight.
                      </p>
                    </div>
                    <Button onClick={() => fileInputRef.current?.click()} type="button" variant="outline">
                      Browse files
                    </Button>
                    <input
                      ref={fileInputRef}
                      accept="image/*,video/*"
                      className="hidden"
                      multiple
                      onChange={(event) => onFilesSelected(event.target.files)}
                      type="file"
                    />
                  </div>
                </div>

                {media.length ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2
                        className="text-sm font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--ds-on-surface-variant)' }}
                      >
                        Media ({media.length})
                      </h2>
                      <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        Drag to reorder
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {media.map((item) => (
                        <div
                          key={item.id}
                          className={cn(
                            'group overflow-hidden rounded-xl border bg-white',
                            draggingId === item.id && 'opacity-60',
                          )}
                          draggable
                          onDragEnd={() => setDraggingId(null)}
                          onDragOver={(event) => event.preventDefault()}
                          onDragStart={() => setDraggingId(item.id)}
                          onDrop={() => {
                            if (draggingId) reorderMedia(draggingId, item.id)
                            setDraggingId(null)
                          }}
                          style={{ borderColor: 'var(--ds-outline-variant)' }}
                        >
                          <div className="relative">
                            <div className="absolute left-2 top-2 z-10 rounded-md bg-black/50 p-1 text-white">
                              <GripVertical className="h-4 w-4" />
                            </div>
                            {item.kind === 'video' ? (
                              <video className="aspect-[9/16] w-full object-cover" muted playsInline src={item.previewUrl} />
                            ) : (
                              <img alt="" className="aspect-[9/16] w-full object-cover" src={item.previewUrl} />
                            )}
                            <button
                              className="absolute right-2 top-2 rounded-md bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100"
                              onClick={() => removeMedia(item.id)}
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="p-2">
                            <Input
                              onChange={(event) => updateMediaNote(item.id, event.target.value)}
                              placeholder={
                                item.kind === 'video' ? 'What is in this clip?' : 'e.g. Master bedroom, city view…'
                              }
                              value={item.note}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                    No media yet — upload at least one photo or clip to continue.
                  </p>
                )}
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Music2 className="mt-0.5 h-4 w-4" style={{ color: 'var(--ds-primary)' }} />
                    <div>
                      <p className="font-semibold">Background music</p>
                      <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        Optional — upload a file or paste a YouTube music link.
                      </p>
                    </div>
                  </div>
                  <Button onClick={() => musicInputRef.current?.click()} size="sm" type="button" variant="outline">
                    {musicFile ? 'Change file' : 'Upload file'}
                  </Button>
                  <input
                    ref={musicInputRef}
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setMusicFile(file)
                      if (file) {
                        setYoutubeMusicUrl('')
                        setYoutubePreview(null)
                        setYoutubeError('')
                      }
                    }}
                    type="file"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold uppercase tracking-wide"
                    htmlFor="youtube-music-url"
                    style={{ color: 'var(--ds-on-surface-variant)' }}
                  >
                    YouTube link
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Link2
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                        style={{ color: 'var(--ds-on-surface-variant)' }}
                      />
                      <Input
                        className="pl-9"
                        id="youtube-music-url"
                        onChange={(event) => {
                          setYoutubeMusicUrl(event.target.value)
                          setYoutubePreview(null)
                          setYoutubeError('')
                        }}
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={youtubeMusicUrl}
                      />
                    </div>
                    <Button
                      disabled={isLoadingYoutube || !youtubeMusicUrl.trim()}
                      onClick={handleLoadYoutubeMusic}
                      type="button"
                      variant="outline"
                    >
                      {isLoadingYoutube ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading…
                        </>
                      ) : (
                        'Use link'
                      )}
                    </Button>
                  </div>
                </div>

                {musicFile ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <p className="truncate" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      {musicFile.name}
                    </p>
                    <button
                      className="text-xs font-semibold"
                      onClick={clearUploadedMusic}
                      style={{ color: 'var(--ds-error)' }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}

                {youtubePreview ? (
                  <div
                    className="flex items-center gap-3 rounded-xl border px-3 py-2"
                    style={{ borderColor: 'var(--ds-outline-variant)' }}
                  >
                    {youtubePreview.thumbnailUrl ? (
                      <img alt="" className="h-12 w-12 rounded-lg object-cover" src={youtubePreview.thumbnailUrl} />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100">
                        <Music2 className="h-5 w-5" style={{ color: 'var(--ds-primary)' }} />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{youtubePreview.title}</p>
                      <p className="truncate text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        {youtubePreview.channel || 'YouTube'}
                      </p>
                    </div>
                    <button
                      className="text-xs font-semibold"
                      onClick={clearUploadedMusic}
                      style={{ color: 'var(--ds-error)' }}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}

                {youtubeError ? (
                  <p className="text-sm" style={{ color: 'var(--ds-error)' }}>
                    {youtubeError}
                  </p>
                ) : null}

                {!musicFile && !youtubePreview ? (
                  <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                    Skip this step if you want AI to pick a cinematic mood without custom music.
                  </p>
                ) : null}
              </div>
            ) : null}

            {activeStep === 4 ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Voice-over</p>
                      <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        Warm narration for each photo, plus a spoken outro at the end
                      </p>
                    </div>
                    <Switch checked={voiceOverEnabled} onCheckedChange={setVoiceOverEnabled} />
                  </div>

                  {voiceOverEnabled ? (
                    <div
                      className="space-y-3 rounded-xl border bg-slate-50 p-3"
                      style={{ borderColor: 'var(--ds-outline-variant)' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">Outro call-to-action</p>
                          <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                            Spoken clearly at the end
                          </p>
                        </div>
                        <Switch checked={outroEnabled} onCheckedChange={setOutroEnabled} />
                      </div>
                      {outroEnabled ? (
                        <Input
                          id="outro-line"
                          onChange={(event) => setOutroLine(event.target.value)}
                          placeholder="Available now. Visit us today."
                          value={outroLine}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <label className="text-sm font-semibold" htmlFor="reel-caption">
                      Social caption override
                    </label>
                    <Textarea
                      id="reel-caption"
                      onChange={(event) => setCaption(event.target.value)}
                      placeholder="Optional — leave blank and AI will write the caption from your brief and photos."
                      rows={3}
                      value={caption}
                    />
                  </div>
                </div>

                <div
                  className="space-y-4 border-t pt-6"
                  style={{ borderColor: 'var(--ds-outline-variant)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <ImageIcon className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--ds-primary)' }} />
                      <div>
                        <p className="font-semibold">Brand logo</p>
                        <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                          Optional watermark on every scene
                        </p>
                      </div>
                    </div>
                    <Switch checked={logoEnabled} disabled={!logoFile} onCheckedChange={setLogoEnabled} />
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button onClick={() => logoInputRef.current?.click()} size="sm" type="button" variant="outline">
                      {logoFile ? 'Change logo' : 'Upload logo'}
                    </Button>
                    <input
                      ref={logoInputRef}
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => onLogoSelected(event.target.files)}
                      type="file"
                    />
                    {logoFile ? (
                      <div
                        className="flex flex-1 items-center gap-3 rounded-xl border px-3 py-2"
                        style={{ borderColor: 'var(--ds-outline-variant)' }}
                      >
                        {logoPreviewUrl ? (
                          <img
                            alt="Logo preview"
                            className="h-16 w-16 rounded-md bg-slate-50 object-contain"
                            src={logoPreviewUrl}
                          />
                        ) : null}
                        <p className="truncate text-sm font-semibold">{logoFile.name}</p>
                        <button
                          className="ml-auto text-xs font-semibold"
                          onClick={clearLogo}
                          style={{ color: 'var(--ds-error)' }}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {logoFile ? (
                    <select
                      className="w-full rounded-xl border bg-white px-3 py-2 text-sm"
                      id="logo-position"
                      onChange={(event) => setLogoPosition(event.target.value as ReelLogoPosition)}
                      style={{ borderColor: 'var(--ds-outline-variant)' }}
                      value={logoPosition}
                    >
                      {LOGO_POSITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeStep === 5 ? (
              <div className="space-y-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-4" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      Template
                    </p>
                    <p className="mt-1 font-semibold">{getTemplateLabel(templateId)}</p>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      Media
                    </p>
                    <p className="mt-1 font-semibold">{media.length} file{media.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      Music
                    </p>
                    <p className="mt-1 font-semibold">
                      {musicFile?.name || youtubePreview?.title || 'AI mood (none selected)'}
                    </p>
                  </div>
                  <div className="rounded-xl border p-4" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      Voice & logo
                    </p>
                    <p className="mt-1 font-semibold">
                      {voiceOverEnabled ? 'Voice-over on' : 'No voice-over'}
                      {logoEnabled && logoFile ? ' · Logo on' : ''}
                    </p>
                  </div>
                </div>

                {reelBrief.trim() ? (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm">
                    <p className="font-semibold">Your brief</p>
                    <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      {reelBrief}
                    </p>
                  </div>
                ) : null}

                {job?.voiceOverScript ? (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm">
                    <p className="font-semibold">Voice-over script</p>
                    <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--ds-on-surface-variant)' }}>
                      {job.voiceOverScript}
                    </p>
                  </div>
                ) : null}

                {job?.hashtags?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {job.hashtags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {error ? (
                  <p className="text-sm" style={{ color: 'var(--ds-error)' }}>
                    {error}
                  </p>
                ) : null}

                <Button
                  className="w-full"
                  disabled={isWorking || isProcessing || !media.length}
                  onClick={handleGenerate}
                  type="button"
                >
                  {isWorking || isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Reel…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Generate Reel
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>

          <div
            className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-4 md:px-8"
            style={{ borderColor: 'var(--ds-outline-variant)', backgroundColor: 'var(--ds-surface-container-low)' }}
          >
            <Button disabled={activeStep === 1} onClick={goToPreviousStep} type="button" variant="outline">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Previous
            </Button>

            {activeStep < STEPS.length ? (
              <Button onClick={goToNextStep} type="button">
                Next step
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                Ready when you are — hit Generate Reel above.
              </p>
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div
          className="sticky top-6 rounded-2xl border bg-white p-5 space-y-4"
          style={{ borderColor: 'var(--ds-outline-variant)' }}
        >
          <p className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--ds-on-surface-variant)' }}>
            Preview
          </p>

          {job ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{statusLabels[job.status]}</span>
                <span>{job.progress}%</span>
              </div>
              <Progress value={job.progress} />
              <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                {job.message}
              </p>
              {job.error ? (
                <p className="text-sm" style={{ color: 'var(--ds-error)' }}>
                  {job.error}
                </p>
              ) : null}
            </div>
          ) : null}

          {videoPlaybackUrl ? (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--ds-outline-variant)' }}>
                <video
                  key={videoPlaybackUrl}
                  className="aspect-[9/16] w-full bg-black object-contain"
                  controls
                  playsInline
                  preload="metadata"
                  src={videoPlaybackUrl}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button asChild type="button" variant="outline">
                  <a download href={videoPlaybackUrl}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
                <Button onClick={() => void handleShare()} type="button" variant="outline">
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="flex aspect-[9/16] items-center justify-center rounded-xl border border-dashed text-center text-sm"
              style={{ borderColor: 'var(--ds-outline-variant)', color: 'var(--ds-on-surface-variant)' }}
            >
              <div>
                <Video className="mx-auto mb-2 h-8 w-8 opacity-50" />
                Your finished Reel appears here
              </div>
            </div>
          )}

          {jobId ? (
            <p className="text-center text-[11px]" style={{ color: 'var(--ds-on-surface-variant)' }}>
              Job {jobId.slice(0, 8)}… — saved while the server is running
            </p>
          ) : null}
        </div>
      </aside>
      </div>
    </div>
  )
}

export { STEPS }
export type { StepDefinition }
