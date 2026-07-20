'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  Film,
  FolderOpen,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react'

import { ReelsMakerCreateFlow, STEPS } from '@/app/reels-maker/reels-maker-create-flow'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { reelsMakerApiPath } from '@/lib/reels-maker/api-base'
import { formatApiError } from '@/lib/reels-maker/api-errors'
import { uploadReelJobAssets } from '@/lib/reels-maker/reels-upload-client'
import { getReelAspectRatioLabel } from '@/lib/reels-maker/aspect-ratio'
import { REEL_TEMPLATES } from '@/lib/reels-maker/templates'
import { getReelVideoPlaybackUrl } from '@/lib/reels-maker/reel-playback'
import type { ReelAspectRatio, ReelDraftSummary, ReelJob, ReelLogoPosition, ReelTemplateId, ReelVoiceGender } from '@/lib/reels-maker/types'
import { cn } from '@/lib/utils'

type LocalMedia = {
  id: string
  file: File
  previewUrl: string
  kind: 'image' | 'video'
  note: string
}

const STATUS_LABELS: Record<ReelJob['status'], string> = {
  queued: 'Queued',
  uploading: 'Uploading…',
  analyzing: 'Analyzing media…',
  generating_story: 'Generating story…',
  writing_captions: 'Writing captions…',
  creating_voiceover: 'Creating voice-over…',
  rendering: 'Rendering video…',
  uploading_result: 'Uploading final Reel…',
  completed: 'Completed',
  failed: 'Failed',
}

function createLocalMedia(file: File): LocalMedia {
  const kind = file.type.startsWith('video/') ? 'video' : 'image'
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    kind,
    note: '',
  }
}

function formatDraftDate(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getTemplateLabel(templateId: ReelTemplateId) {
  return REEL_TEMPLATES.find((template) => template.id === templateId)?.label ?? templateId
}

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

type FullscreenCapableVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
}

function requestVideoFullscreen(video: HTMLVideoElement) {
  const iosVideo = video as FullscreenCapableVideo
  if (typeof iosVideo.webkitEnterFullscreen === 'function') {
    iosVideo.webkitEnterFullscreen()
    return Promise.resolve()
  }

  const target = (video.parentElement ?? video) as FullscreenCapableElement
  if (target.requestFullscreen) return target.requestFullscreen()
  if (target.webkitRequestFullscreen) return Promise.resolve(target.webkitRequestFullscreen())
  return Promise.resolve()
}

function closeDraftPlayer(video: HTMLVideoElement | null, onClose: () => void) {
  video?.pause()
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {})
  }
  onClose()
}

async function readApiJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    if (/server action/i.test(text)) {
      throw new Error(
        'Dev server is still recompiling. Wait a few seconds, then click Generate Reel again.',
      )
    }
    if (response.status === 404) {
      throw new Error(
        'Reel job not found. If you restarted the dev server, click Generate Reel again.',
      )
    }
    throw new Error(text.slice(0, 120).trim() || `Unexpected server response (${response.status}).`)
  }
}

async function waitForJob(jobId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(reelsMakerApiPath(`/api/reels-maker/jobs/${jobId}`), { cache: 'no-store' })
    if (response.ok) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

async function postJobUpload(jobId: string, formData: FormData) {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 800 * attempt))
    }
    const response = await fetch(reelsMakerApiPath(`/api/reels-maker/jobs/${jobId}/upload`), {
      method: 'POST',
      body: formData,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    try {
      const data = await readApiJson(response)
      if (response.ok) return data
      lastError = new Error(
        formatApiError(
          data.error,
          response.status === 404
            ? 'Reel job expired after a server restart. Click Generate Reel again.'
            : 'Upload failed.',
        ),
      )
      if (response.status !== 404) break
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Upload failed.')
      if (!/recompiling|server action/i.test(lastError.message)) break
    }
  }
  throw lastError ?? new Error('Upload failed.')
}

export default function ReelsMakerClient({ mode = 'reels' }: { mode?: 'reels' | 'youtube' }) {
  const isYoutube = mode === 'youtube'
  const [pageTab, setPageTab] = useState<'create' | 'drafts'>('create')
  const [activeStep, setActiveStep] = useState(1)
  const [drafts, setDrafts] = useState<ReelDraftSummary[]>([])
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(false)
  const [templateId, setTemplateId] = useState<ReelTemplateId>('social-trend')
  const [aspectRatio, setAspectRatio] = useState<ReelAspectRatio>(isYoutube ? 'landscape' : 'portrait')
  const [voiceOverEnabled, setVoiceOverEnabled] = useState(true)
  const [voiceGender, setVoiceGender] = useState<ReelVoiceGender>('woman')
  const [outroEnabled, setOutroEnabled] = useState(true)
  const [outroLine, setOutroLine] = useState(
    isYoutube ? 'Scan for listing details' : 'Available now. Visit us today.',
  )
  const [listingTitle, setListingTitle] = useState('')
  const [listingDetails, setListingDetails] = useState('')
  const [reelBrief, setReelBrief] = useState('')
  const [caption, setCaption] = useState('')
  const [media, setMedia] = useState<LocalMedia[]>([])
  const [musicFile, setMusicFile] = useState<File | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null)
  const [logoEnabled, setLogoEnabled] = useState(false)
  const [logoPosition, setLogoPosition] = useState<ReelLogoPosition>(isYoutube ? 'top-left' : 'top-right')
  const [job, setJob] = useState<ReelJob | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState('')
  const [viewingDraft, setViewingDraft] = useState<ReelDraftSummary | null>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const musicInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadDrafts = useCallback(async () => {
    setIsLoadingDrafts(true)
    try {
      const response = await fetch(reelsMakerApiPath('/api/reels-maker/jobs'), { cache: 'no-store' })
      const data = await readApiJson(response)
      if (!response.ok) throw new Error(formatApiError(data.error, 'Unable to load drafts.'))
      setDrafts(Array.isArray(data.drafts) ? (data.drafts as ReelDraftSummary[]) : [])
    } catch {
      setDrafts([])
    } finally {
      setIsLoadingDrafts(false)
    }
  }, [])

  useEffect(() => {
    void loadDrafts()
  }, [loadDrafts])

  const isProcessing = useMemo(() => {
    if (!job) return false
    return !['queued', 'uploading', 'completed', 'failed'].includes(job.status)
  }, [job])

  const currentStepDef = STEPS.find((step) => step.id === activeStep) ?? STEPS[0]
  const StepIcon = currentStepDef.icon

  function validateStep(step: number): string | null {
    if (step === 2 && !media.length) return 'Add at least one photo or short video before continuing.'
    return null
  }

  function goToNextStep() {
    const stepError = validateStep(activeStep)
    if (stepError) {
      setError(stepError)
      return
    }
    setError('')
    setActiveStep((current) => Math.min(current + 1, STEPS.length))
  }

  function goToPreviousStep() {
    setError('')
    setActiveStep((current) => Math.max(current - 1, 1))
  }

  useEffect(() => {
    return () => {
      for (const item of media) URL.revokeObjectURL(item.previewUrl)
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [media, logoPreviewUrl])

  const pollJob = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current)

    const refreshJob = async () => {
      try {
        const response = await fetch(reelsMakerApiPath(`/api/reels-maker/jobs/${id}`), { cache: 'no-store' })
        const data = await readApiJson(response)
        if (!response.ok) throw new Error(formatApiError(data.error, 'Unable to load job status.'))
        const nextJob = data.job as ReelJob
        setJob(nextJob)
        if (nextJob.caption && !caption) setCaption(nextJob.caption)
        if (nextJob.status === 'completed' || nextJob.status === 'failed') {
          setIsWorking(false)
          void loadDrafts()
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : 'Status polling failed.')
        setIsWorking(false)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }

    void refreshJob()
    pollRef.current = setInterval(() => {
      void refreshJob()
    }, 1500)
  }, [caption, loadDrafts])

  useEffect(() => {
    if (!viewingDraft) return

    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDraftPlayer(previewVideoRef.current, () => setViewingDraft(null))
      }
    }

    const onFullscreenChange = () => {
      if (document.fullscreenElement) return
      const video = previewVideoRef.current as FullscreenCapableVideo | null
      if (video?.webkitDisplayingFullscreen) return
      setViewingDraft(null)
      video?.pause()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [viewingDraft])

  useEffect(() => {
    const video = previewVideoRef.current
    if (!video || !viewingDraft) return

    const onWebkitEnd = () => setViewingDraft(null)
    video.addEventListener('webkitendfullscreen', onWebkitEnd)
    return () => video.removeEventListener('webkitendfullscreen', onWebkitEnd)
  }, [viewingDraft])

  function playDraft(draft: ReelDraftSummary) {
    if (!draft.resultUrl) {
      setError('This reel is not ready to play yet.')
      return
    }

    const video = previewVideoRef.current
    const src = getReelVideoPlaybackUrl(draft.id, draft.resultUrl)
    if (!video || !src) return

    setError('')
    setViewingDraft(draft)
    video.src = src
    video.load()

    void video
      .play()
      .then(() => requestVideoFullscreen(video))
      .catch(() => {})
  }

  function stopDraftPlayback() {
    closeDraftPlayer(previewVideoRef.current, () => setViewingDraft(null))
  }

  async function deleteDraft(draftId: string) {
    try {
      const response = await fetch(reelsMakerApiPath(`/api/reels-maker/jobs/${draftId}`), { method: 'DELETE' })
      if (!response.ok) {
        const data = await readApiJson(response)
        throw new Error(formatApiError(data.error, 'Unable to delete draft.'))
      }
      if (jobId === draftId) {
        setJob(null)
        setJobId(null)
      }
      await loadDrafts()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete draft.')
    }
  }

  function onFilesSelected(fileList: FileList | null) {
    if (!fileList?.length) return
    const next = [...fileList]
      .filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'))
      .map(createLocalMedia)
    setMedia((current) => [...current, ...next])
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    onFilesSelected(event.dataTransfer.files)
  }

  function removeMedia(id: string) {
    setMedia((current) => {
      const target = current.find((item) => item.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  function updateMediaNote(id: string, note: string) {
    setMedia((current) => current.map((item) => (item.id === id ? { ...item, note } : item)))
  }

  function reorderMedia(sourceId: string, targetId: string) {
    setMedia((current) => {
      const sourceIndex = current.findIndex((item) => item.id === sourceId)
      const targetIndex = current.findIndex((item) => item.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current
      const next = [...current]
      const [moved] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
  }

  function clearUploadedMusic() {
    setMusicFile(null)
    if (musicInputRef.current) musicInputRef.current.value = ''
  }

  function clearLogo() {
    setLogoFile(null)
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
    setLogoPreviewUrl(null)
    setLogoEnabled(false)
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  function onLogoSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file || !file.type.startsWith('image/')) return
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
    setLogoFile(file)
    setLogoPreviewUrl(URL.createObjectURL(file))
    setLogoEnabled(true)
  }

  async function handleGenerate() {
    if (!media.length) {
      setError('Add at least one photo or short video.')
      return
    }

    setError('')
    setIsWorking(true)
    setActiveStep(5)

    try {
      const createResponse = await fetch(reelsMakerApiPath('/api/reels-maker/jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          templateId,
          aspectRatio: isYoutube ? 'landscape' : aspectRatio,
          outputFormat: isYoutube ? 'youtube' : 'reels',
          voiceOverEnabled,
          voiceGender,
          outroEnabled,
          outroLine: outroLine.trim(),
          listingTitle: listingTitle.trim() || undefined,
          listingDetails: listingDetails.trim() || undefined,
          reelBrief: reelBrief.trim() || undefined,
          customCaption: caption.trim() || undefined,
        }),
        cache: 'no-store',
      })
      const createData = await readApiJson(createResponse)
      if (!createResponse.ok) throw new Error(formatApiError(createData.error, 'Unable to start job.'))

      const createdJob = createData.job as ReelJob
      const newJobId = createdJob.id
      await waitForJob(newJobId)
      setJobId(newJobId)
      setJob({
        ...createdJob,
        status: 'uploading',
        progress: 12,
        message: 'Uploading photos to cloud…',
      })

      setJob((current) =>
        current
          ? {
              ...current,
              message: musicFile ? 'Uploading photos and music…' : 'Uploading photos to cloud…',
              progress: Math.max(current.progress, 18),
            }
          : current,
      )

      const uploadData = await uploadReelJobAssets(
        newJobId,
        {
          media: media.map((item) => ({ file: item.file, note: item.note })),
          music: musicFile,
          logo: logoFile,
          logoEnabled,
          logoPosition,
        },
        reelsMakerApiPath,
      )
      setJob(uploadData.job as ReelJob)
      if (typeof uploadData.warning === 'string' && uploadData.warning.trim()) {
        setError(uploadData.warning)
      }

      const renderResponse = await fetch(reelsMakerApiPath(`/api/reels-maker/jobs/${newJobId}/render`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          reelBrief: reelBrief.trim(),
          caption: caption.trim(),
          voiceOverEnabled,
          voiceGender,
          outroEnabled,
          outroLine: outroLine.trim(),
          listingTitle: listingTitle.trim() || undefined,
          listingDetails: listingDetails.trim() || undefined,
          templateId,
          aspectRatio: isYoutube ? 'landscape' : aspectRatio,
          outputFormat: isYoutube ? 'youtube' : 'reels',
        }),
        cache: 'no-store',
      })
      const renderData = await readApiJson(renderResponse)
      if (!renderResponse.ok) {
        throw new Error(formatApiError(renderData.error, 'Render failed to start.'))
      }

      setJob((current) =>
        current
          ? {
              ...current,
              status: 'analyzing',
              progress: Math.max(current.progress, 38),
              message: 'Starting generation…',
            }
          : current,
      )
      pollJob(newJobId)
    } catch (generateError) {
      setIsWorking(false)
      setError(generateError instanceof Error ? generateError.message : 'Generation failed.')
    }
  }

  async function handleShare() {
    if (!job?.resultUrl || !jobId) return
    const playbackUrl = getReelVideoPlaybackUrl(jobId, job.resultUrl)
    const shareUrl =
      playbackUrl && typeof window !== 'undefined'
        ? new URL(playbackUrl, window.location.origin).href
        : job.resultUrl
    if (navigator.share) {
      await navigator.share({
        title: job.plan?.title ?? 'Homes Reel',
        text: caption || job.caption,
        url: shareUrl,
      })
      return
    }
    await navigator.clipboard.writeText(shareUrl)
  }

  const videoPlaybackUrl =
    jobId && job?.resultUrl ? getReelVideoPlaybackUrl(jobId, job.resultUrl) : null

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 pb-16 sm:p-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'var(--ds-primary-container)', color: 'var(--ds-primary)' }}
          >
            <Film className="h-5 w-5" />
          </div>
          <div>
            <h1
              className="text-2xl font-bold sm:text-3xl"
              style={{ fontFamily: 'var(--font-noto-serif)', color: 'var(--ds-on-surface)' }}
            >
              {isYoutube ? 'YouTube Listing Videos' : 'AI Reels Maker'}
            </h1>
            <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
              {isYoutube
                ? 'Build landscape (16:9) listing videos with the Homes.ph YouTube outro for partners.'
                : 'Follow the 5 guided steps to build and export a cinematic 9:16 Reel.'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              setPageTab('create')
              setActiveStep(1)
            }}
            type="button"
            variant={pageTab === 'create' ? 'default' : 'outline'}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Create
          </Button>
          <Button
            onClick={() => {
              setPageTab('drafts')
              void loadDrafts()
            }}
            type="button"
            variant={pageTab === 'drafts' ? 'default' : 'outline'}
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            My Reels
            {drafts.length ? (
              <Badge className="ml-2" variant="secondary">
                {drafts.length}
              </Badge>
            ) : null}
          </Button>
        </div>
      </header>

      <div
        aria-hidden={!viewingDraft?.resultUrl}
        className={cn(
          'fixed inset-0 z-[100] flex flex-col bg-black',
          !viewingDraft?.resultUrl && 'pointer-events-none invisible',
        )}
      >
        <div className="relative z-10 flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 text-white">
            <p className="truncate font-semibold">{viewingDraft?.title ?? 'Reel preview'}</p>
            <p className="text-xs text-white/70">
              {viewingDraft ? getTemplateLabel(viewingDraft.templateId) : ''}
            </p>
          </div>
          <Button
            className="shrink-0 text-white hover:bg-white/10 hover:text-white"
            onClick={stopDraftPlayback}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
          <video
            ref={previewVideoRef}
            className="max-h-full max-w-full object-contain"
            controls
            playsInline
            poster={viewingDraft?.thumbnailUrl ?? undefined}
            preload="auto"
            onEnded={stopDraftPlayback}
          />
        </div>

        {viewingDraft?.resultUrl ? (
          <div className="relative z-10 p-4">
            <Button asChild className="w-full" type="button" variant="secondary">
              <a
                download
                href={getReelVideoPlaybackUrl(viewingDraft.id, viewingDraft.resultUrl) ?? viewingDraft.resultUrl}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          </div>
        ) : null}
      </div>

      {pageTab === 'drafts' ? (
        <section className="space-y-4">
          {error ? (
            <div
              className="rounded-xl border px-4 py-3 text-sm"
              style={{ borderColor: 'var(--ds-error)', color: 'var(--ds-error)' }}
            >
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Your Reel drafts</h2>
              <p className="text-sm" style={{ color: 'var(--ds-on-surface-variant)' }}>
                All reels created on this server — play, download, or delete.
              </p>
            </div>
            <Button disabled={isLoadingDrafts} onClick={() => void loadDrafts()} type="button" variant="outline">
              {isLoadingDrafts ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
            </Button>
          </div>

          {isLoadingDrafts ? (
            <div className="flex min-h-48 items-center justify-center rounded-2xl border bg-white" style={{ borderColor: 'var(--ds-outline-variant)' }}>
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--ds-primary)' }} />
            </div>
          ) : drafts.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {drafts.map((draft) => {
                const playbackUrl = getReelVideoPlaybackUrl(draft.id, draft.resultUrl)
                const canPlay = Boolean(draft.resultUrl && playbackUrl)

                return (
                <article
                  key={draft.id}
                  className="overflow-hidden rounded-2xl border bg-white"
                  style={{ borderColor: 'var(--ds-outline-variant)' }}
                >
                  <div
                    className="group relative aspect-[9/16] cursor-pointer bg-slate-100"
                    onClick={() => playDraft(draft)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        playDraft(draft)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {draft.resultUrl && playbackUrl ? (
                      <video
                        className="h-full w-full object-cover"
                        muted
                        playsInline
                        poster={draft.thumbnailUrl ?? undefined}
                        preload="metadata"
                        src={playbackUrl}
                      />
                    ) : draft.thumbnailUrl ? (
                      <img alt="" className="h-full w-full object-cover" src={draft.thumbnailUrl} />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Video className="h-10 w-10 opacity-40" />
                      </div>
                    )}
                    {draft.resultUrl ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md">
                          <Play className="h-5 w-5 fill-current" />
                        </span>
                      </div>
                    ) : null}
                    <div className="absolute left-3 top-3">
                      <Badge variant={draft.status === 'completed' ? 'default' : draft.status === 'failed' ? 'destructive' : 'secondary'}>
                        {STATUS_LABELS[draft.status] ?? draft.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3 p-4">
                    <div>
                      <p className="font-semibold line-clamp-1">{draft.title}</p>
                      <p className="text-xs" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        {getTemplateLabel(draft.templateId)} · {draft.mediaCount} files · {formatDraftDate(draft.updatedAt)}
                      </p>
                    </div>

                    {draft.caption ? (
                      <p className="text-sm line-clamp-2" style={{ color: 'var(--ds-on-surface-variant)' }}>
                        {draft.caption}
                      </p>
                    ) : null}

                    {draft.error ? (
                      <p className="text-xs" style={{ color: 'var(--ds-error)' }}>
                        {draft.error}
                      </p>
                    ) : null}

                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        disabled={!canPlay}
                        onClick={() => playDraft(draft)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Play className="mr-1 h-4 w-4" />
                        Play
                      </Button>
                      {playbackUrl ? (
                        <Button asChild size="sm" type="button" variant="outline">
                          <a download href={playbackUrl}>
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button disabled size="sm" type="button" variant="outline">
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button onClick={() => void deleteDraft(draft.id)} size="sm" type="button" variant="outline">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </article>
              )})}
            </div>
          ) : (
            <div
              className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-white text-center"
              style={{ borderColor: 'var(--ds-outline-variant)', color: 'var(--ds-on-surface-variant)' }}
            >
              <FolderOpen className="h-8 w-8 opacity-50" />
              <p className="font-medium">No reels yet</p>
              <p className="text-sm">Create your first Reel and it will appear here.</p>
              <Button className="mt-2" onClick={() => setPageTab('create')} type="button">
                Create Reel
              </Button>
            </div>
          )}
        </section>
      ) : (
        <ReelsMakerCreateFlow
          mode={mode}
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          currentStepDef={currentStepDef}
          StepIcon={StepIcon}
          goToNextStep={goToNextStep}
          goToPreviousStep={goToPreviousStep}
          reelBrief={reelBrief}
          setReelBrief={setReelBrief}
          listingTitle={listingTitle}
          setListingTitle={setListingTitle}
          listingDetails={listingDetails}
          setListingDetails={setListingDetails}
          templateId={templateId}
          setTemplateId={setTemplateId}
          aspectRatio={aspectRatio}
          setAspectRatio={setAspectRatio}
          getAspectRatioLabel={getReelAspectRatioLabel}
          media={media}
          draggingId={draggingId}
          setDraggingId={setDraggingId}
          fileInputRef={fileInputRef}
          onDrop={onDrop}
          onFilesSelected={onFilesSelected}
          removeMedia={removeMedia}
          updateMediaNote={updateMediaNote}
          reorderMedia={reorderMedia}
          musicFile={musicFile}
          musicInputRef={musicInputRef}
          setMusicFile={setMusicFile}
          clearUploadedMusic={clearUploadedMusic}
          voiceOverEnabled={voiceOverEnabled}
          setVoiceOverEnabled={setVoiceOverEnabled}
          voiceGender={voiceGender}
          setVoiceGender={setVoiceGender}
          outroEnabled={outroEnabled}
          setOutroEnabled={setOutroEnabled}
          outroLine={outroLine}
          setOutroLine={setOutroLine}
          caption={caption}
          setCaption={setCaption}
          logoFile={logoFile}
          logoPreviewUrl={logoPreviewUrl}
          logoEnabled={logoEnabled}
          setLogoEnabled={setLogoEnabled}
          logoPosition={logoPosition}
          setLogoPosition={setLogoPosition}
          logoInputRef={logoInputRef}
          onLogoSelected={onLogoSelected}
          clearLogo={clearLogo}
          getTemplateLabel={getTemplateLabel}
          job={job}
          jobId={jobId}
          error={error}
          isWorking={isWorking}
          isProcessing={isProcessing}
          handleGenerate={() => void handleGenerate()}
          handleShare={() => void handleShare()}
          statusLabels={STATUS_LABELS}
          videoPlaybackUrl={videoPlaybackUrl}
        />
      )}
    </div>
  )
}
