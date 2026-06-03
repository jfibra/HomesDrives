'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

const PosterEditor = dynamic(() => import('./poster-editor'), { ssr: false })
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Cog,
  ImagePlus,
  LayoutTemplate,
  NotebookText,
  Palette,
  Plus,
  Shapes,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type {
  PosterDesignStyle,
  PosterFormat,
  PosterType,
} from '@/lib/poster-format-settings'

type AdminContext = {
  code: string
  fullName: string
  firstName: string
  email: string
  role: 'admin' | 'media' | 'customer'
}

type UploadedAsset = {
  id: string
  file: File
  previewUrl: string
}

type PersonDraft = {
  id: string
  name: string
  company: string
  jobTitle: string
  photo: UploadedAsset | null
}

type StepDefinition = {
  id: number
  label: string
  description: string
  icon: LucideIcon
}

const STEPS: StepDefinition[] = [
  { id: 1, label: 'Direction', description: 'Poster type & design style', icon: LayoutTemplate },
  { id: 2, label: 'Canvas', description: 'Output size & orientation', icon: Shapes },
  { id: 3, label: 'Copy', description: 'Headline, subtitle & content', icon: NotebookText },
  { id: 4, label: 'Branding', description: 'Logo attachments', icon: ImagePlus },
  { id: 5, label: 'Scene', description: 'Background or featured photo', icon: Camera },
  { id: 6, label: 'People', description: 'Person photos & profiles', icon: UserRound },
]

function readAdminContext(): AdminContext | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem('homes-admin-context')
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<AdminContext>
    if (!parsed.code || parsed.role !== 'admin') return null
    return parsed as AdminContext
  } catch {
    return null
  }
}

function createPersonDraft(): PersonDraft {
  return { id: crypto.randomUUID(), name: '', company: '', jobTitle: '', photo: null }
}

function createUploadedAsset(file: File): UploadedAsset {
  return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) }
}

export default function PosterGeneratorClient() {
  const [formats, setFormats] = useState<PosterFormat[]>([])
  const [posterTypes, setPosterTypes] = useState<PosterType[]>([])
  const [designStyles, setDesignStyles] = useState<PosterDesignStyle[]>([])
  const [selectedFormatName, setSelectedFormatName] = useState('')
  const [selectedPosterType, setSelectedPosterType] = useState('')
  const [selectedDesignStyle, setSelectedDesignStyle] = useState('')
  const [headline, setHeadline] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [content, setContent] = useState('')
  const [aiInstructions, setAiInstructions] = useState('')
  const [logos, setLogos] = useState<UploadedAsset[]>([])
  const [scenePhoto, setScenePhoto] = useState<UploadedAsset | null>(null)
  const [sceneMode, setSceneMode] = useState<'background' | 'feature'>('background')
  const [people, setPeople] = useState<PersonDraft[]>([createPersonDraft()])
  const [activeStep, setActiveStep] = useState(1)
  const [isLoadingFormats, setIsLoadingFormats] = useState(true)
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosterUrl, setGeneratedPosterUrl] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<'gemini' | 'perplexity'>('gemini')
  const [isEditing, setIsEditing] = useState(false)
  const objectUrlsRef = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false
    const admin = readAdminContext()
    if (!admin?.code) {
      setError('Admin context was not found. Sign in through the admin console first.')
      setIsLoadingFormats(false)
      return
    }
    const adminCode = admin.code
    async function loadFormats() {
      setIsLoadingFormats(true)
      setError('')
      try {
        const search = new URLSearchParams({ adminCode })
        const response = await fetch(`/api/admin/settings/ai-poster-generator-settings?${search}`)
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.error || 'Unable to load AI poster settings.')
        if (!cancelled) {
          const incomingFormats = Array.isArray(data?.settings?.formats?.value) ? data.settings.formats.value : []
          const incomingPosterTypes = Array.isArray(data?.settings?.posterTypes?.value) ? data.settings.posterTypes.value : []
          const incomingDesignStyles = Array.isArray(data?.settings?.designStyles?.value) ? data.settings.designStyles.value : []
          setFormats(incomingFormats)
          setPosterTypes(incomingPosterTypes)
          setDesignStyles(incomingDesignStyles)
          setSelectedFormatName(incomingFormats[0]?.name ?? '')
          setSelectedPosterType(incomingPosterTypes[0]?.name ?? '')
          setSelectedDesignStyle(incomingDesignStyles[0]?.name ?? '')
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load AI poster settings.')
      } finally {
        if (!cancelled) setIsLoadingFormats(false)
      }
    }
    void loadFormats()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    objectUrlsRef.current = [
      ...logos.map((l) => l.previewUrl),
      ...(scenePhoto ? [scenePhoto.previewUrl] : []),
      ...people.map((p) => p.photo?.previewUrl).filter((v): v is string => Boolean(v)),
    ]
  }, [logos, scenePhoto, people])

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url)
    }
  }, [])

  const groupedFormats = useMemo(() => {
    return formats.reduce<Record<string, PosterFormat[]>>((acc, format) => {
      const category = format.category.trim() || 'Uncategorized'
      acc[category] = [...(acc[category] ?? []), format]
      return acc
    }, {})
  }, [formats])

  const selectedFormat = useMemo(
    () => formats.find((f) => f.name === selectedFormatName) ?? formats[0] ?? null,
    [formats, selectedFormatName],
  )

  const selectedPosterTypeValue = useMemo(
    () => posterTypes.find((t) => t.name === selectedPosterType) ?? posterTypes[0] ?? null,
    [posterTypes, selectedPosterType],
  )

  const selectedDesignStyleValue = useMemo(
    () => designStyles.find((s) => s.name === selectedDesignStyle) ?? designStyles[0] ?? null,
    [designStyles, selectedDesignStyle],
  )

  const completedStepCount = useMemo(() => {
    let total = 0
    if (selectedPosterTypeValue && selectedDesignStyleValue) total++
    if (selectedFormat) total++
    if (headline.trim() || subtitle.trim() || content.trim()) total++
    if (logos.length > 0) total++
    if (scenePhoto) total++
    if (people.some((p) => p.photo || p.name.trim() || p.company.trim() || p.jobTitle.trim())) total++
    return total
  }, [content, headline, logos.length, scenePhoto, people, selectedDesignStyleValue, selectedFormat, selectedPosterTypeValue, subtitle])

  function handleLogoUpload(files: FileList | null) {
    if (!files?.length) return
    setLogos((current) => [...current, ...Array.from(files).map(createUploadedAsset)])
  }

  function removeLogo(id: string) {
    setLogos((current) => {
      const logo = current.find((item) => item.id === id)
      if (logo) URL.revokeObjectURL(logo.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  function attachScenePhoto(file: File) {
    setScenePhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return createUploadedAsset(file)
    })
  }

  function removeScenePhoto() {
    setScenePhoto((current) => {
      if (current) URL.revokeObjectURL(current.previewUrl)
      return null
    })
  }

  function addPerson() {
    setPeople((current) => [...current, createPersonDraft()])
  }

  function updatePerson(id: string, field: keyof Omit<PersonDraft, 'id' | 'photo'>, value: string) {
    setPeople((current) => current.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }

  function attachPersonPhoto(id: string, file: File | null) {
    if (!file) return
    setPeople((current) =>
      current.map((person) => {
        if (person.id !== id) return person
        if (person.photo) URL.revokeObjectURL(person.photo.previewUrl)
        return { ...person, photo: createUploadedAsset(file) }
      }),
    )
  }

  function removePersonPhoto(id: string) {
    setPeople((current) =>
      current.map((person) => {
        if (person.id !== id) return person
        if (person.photo) URL.revokeObjectURL(person.photo.previewUrl)
        return { ...person, photo: null }
      }),
    )
  }

  function removePerson(id: string) {
    setPeople((current) => {
      const person = current.find((item) => item.id === id)
      if (person?.photo) URL.revokeObjectURL(person.photo.previewUrl)
      const next = current.filter((item) => item.id !== id)
      return next.length > 0 ? next : [createPersonDraft()]
    })
  }

  function goToNextStep() { setActiveStep((current) => Math.min(current + 1, STEPS.length)) }
  function goToPreviousStep() { setActiveStep((current) => Math.max(current - 1, 1)) }

  async function handleGenerate() {
    setGenerationError('')
    setGeneratedPosterUrl(null)
    setIsGenerating(true)
    try {
      const form = new FormData()
      form.set('provider', selectedProvider)
      form.set('posterType', selectedPosterType)
      form.set('designStyle', selectedDesignStyle)
      form.set('designTraits', selectedDesignStyleValue?.traits?.join(', ') ?? '')
      form.set('formatName', selectedFormat?.name ?? '')
      form.set('formatWidth', String(selectedFormat?.width ?? ''))
      form.set('formatHeight', String(selectedFormat?.height ?? ''))
      form.set('headline', headline)
      form.set('subtitle', subtitle)
      form.set('content', content)
      form.set('aiInstructions', aiInstructions)
      form.set('people', JSON.stringify(people.map((p) => ({ name: p.name, company: p.company, jobTitle: p.jobTitle }))))
      form.set('sceneMode', sceneMode)
      if (scenePhoto) form.set('scene_photo', scenePhoto.file)
      logos.forEach((logo, i) => form.set(`logo_${i}`, logo.file))
      people.forEach((person, i) => {
        if (person.photo) {
          form.set(`person_photo_${i}`, person.photo.file)
          form.set(`person_name_${i}`, person.name)
        }
      })
      const response = await fetch('/api/poster-generator/generate', { method: 'POST', body: form })
      const data = (await response.json().catch(() => null)) as { imageData?: string; mimeType?: string; error?: string } | null
      if (!response.ok || !data?.imageData) throw new Error(data?.error ?? 'Poster generation failed.')
      setGeneratedPosterUrl(`data:${data.mimeType ?? 'image/png'};base64,${data.imageData}`)
    } catch (generateError) {
      setGenerationError(generateError instanceof Error ? generateError.message : 'Poster generation failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const currentStepDef = STEPS.find((s) => s.id === activeStep) ?? STEPS[0]
  const StepIcon = currentStepDef.icon

  return (
    <div className="min-h-screen bg-[#f3efe7]">

      {/* ── Page header ── */}
      <header className="bg-[#10233f] px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3.5 w-3.5 text-[#b88952]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#b88952]">AI-Powered Tool</span>
            </div>
            <h1 className="text-2xl font-bold text-white md:text-3xl">Poster Generator</h1>
            <p className="mt-1 text-sm text-[#8facca]">
              Complete all 5 steps to build your brief, then generate your AI poster.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-white/15 bg-white/8 text-white hover:bg-white/12 hover:text-white"
          >
            <Link href="/settings/ai-poster-format-settings">
              <Cog className="mr-2 h-4 w-4" />
              Manage Presets
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">

        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[240px_1fr_288px]">

          {/* ── LEFT: Vertical stepper sidebar (xl+) ── */}
          <aside className="hidden xl:block">
            <div className="sticky top-6 rounded-2xl border border-[#d7d0c4] bg-white p-5 shadow-sm">
              <p className="mb-5 text-[11px] font-bold uppercase tracking-widest text-[#8b7559]">Guided Steps</p>
              <ol>
                {STEPS.map((step, index) => {
                  const isActive = step.id === activeStep
                  const isCompleted = step.id < activeStep
                  const isLast = index === STEPS.length - 1
                  const Icon = step.icon
                  return (
                    <li key={step.id} className="flex gap-3">
                      {/* Circle + connector line */}
                      <div className="flex flex-col items-center">
                        <button
                          type="button"
                          onClick={() => setActiveStep(step.id)}
                          aria-label={`Go to step ${step.id}: ${step.label}`}
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10233f]',
                            isCompleted
                              ? 'border-[#c6603d] bg-[#c6603d] text-white'
                              : isActive
                              ? 'border-[#10233f] bg-[#10233f] text-white shadow-md'
                              : 'border-[#ddd4c6] bg-white text-[#c4b8a6]',
                          )}
                        >
                          {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                        </button>
                        {!isLast && (
                          <div
                            className={cn(
                              'my-1 h-8 w-0.5 rounded-full',
                              isCompleted ? 'bg-[#c6603d]/40' : 'bg-[#e8dfd1]',
                            )}
                          />
                        )}
                      </div>
                      {/* Label */}
                      <div className={cn('flex-1 min-w-0', !isLast && 'mb-2')}>
                        <button
                          type="button"
                          onClick={() => setActiveStep(step.id)}
                          className="block w-full text-left pb-1"
                        >
                          <p
                            className={cn(
                              'text-sm font-semibold leading-none',
                              isActive ? 'text-[#10233f]' : isCompleted ? 'text-[#c6603d]' : 'text-[#b0a494]',
                            )}
                          >
                            {step.label}
                          </p>
                          <p
                            className={cn(
                              'mt-1 text-xs leading-snug',
                              isActive ? 'text-[#5d6777]' : 'text-[#c0b5a6]',
                            )}
                          >
                            {step.description}
                          </p>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ol>

              {/* Progress */}
              <div className="mt-5 border-t border-[#ede6da] pt-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-[#8b7559]">Sections filled</span>
                  <span className="font-bold text-[#10233f]">{completedStepCount} / 6</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#ede6da]">
                  <div
                    className="h-full rounded-full bg-[#c6603d] transition-all duration-500"
                    style={{ width: `${(completedStepCount / 6) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* ── CENTER: Step content ── */}
          <div className="min-w-0 space-y-4">

            {/* Mobile step indicator */}
            <div className="xl:hidden rounded-2xl border border-[#d7d0c4] bg-white px-5 py-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#10233f]">{currentStepDef.label}</span>
                <span className="text-[#8b7559]">Step {activeStep} / {STEPS.length}</span>
              </div>
              <div className="flex gap-1.5">
                {STEPS.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    aria-label={`Go to step ${step.id}`}
                    className={cn(
                      'h-2 flex-1 rounded-full transition-all',
                      step.id === activeStep
                        ? 'bg-[#10233f]'
                        : step.id < activeStep
                        ? 'bg-[#c6603d]'
                        : 'bg-[#ddd4c6]',
                    )}
                  />
                ))}
              </div>
            </div>

            {/* ── Main step card ── */}
            <div className="overflow-hidden rounded-2xl border border-[#d7d0c4] bg-white shadow-[0_4px_32px_-8px_rgba(16,35,63,0.14)]">

              {/* Card header */}
              <div className="border-b border-[#ede6da] bg-[#faf7f2] px-6 py-5 md:px-8 md:py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#10233f] text-white shadow-md">
                      <StepIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-[#b88952]">
                        Step {activeStep} of {STEPS.length}
                      </p>
                      <h2 className="mt-0.5 text-xl font-bold text-[#10233f]">{currentStepDef.label}</h2>
                      <p className="text-sm text-[#5d6777]">{currentStepDef.description}</p>
                    </div>
                  </div>
                  {/* Step pip dots */}
                  <div className="hidden shrink-0 sm:flex items-center gap-1.5 pt-1">
                    {STEPS.map((step) => (
                      <div
                        key={step.id}
                        className={cn(
                          'h-2 rounded-full transition-all duration-300',
                          step.id === activeStep
                            ? 'w-5 bg-[#10233f]'
                            : step.id < activeStep
                            ? 'w-2 bg-[#c6603d]'
                            : 'w-2 bg-[#ddd4c6]',
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Card body */}
              <div className="px-6 py-6 md:px-8 md:py-8">
                {isLoadingFormats ? (
                  <div className="flex items-center gap-3 rounded-xl bg-[#faf7f2] px-5 py-6 text-sm text-[#5d6777]">
                    <svg className="h-5 w-5 shrink-0 animate-spin text-[#10233f]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Loading poster settings…
                  </div>
                ) : null}

                {/* ── STEP 1: Direction ── */}
                {!isLoadingFormats && activeStep === 1 ? (
                  <div className="grid gap-5 lg:grid-cols-2">
                    {/* Poster types */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#10233f] text-white">
                          <LayoutTemplate className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#10233f]">Poster Type</h3>
                          <p className="text-xs text-[#5d6777]">Select the campaign intent</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {posterTypes.length ? (
                          posterTypes.map((item) => {
                            const selected = selectedPosterTypeValue?.name === item.name
                            return (
                              <button
                                key={`${item.category}-${item.name}`}
                                type="button"
                                onClick={() => setSelectedPosterType(item.name)}
                                className={cn(
                                  'w-full rounded-xl border px-4 py-3 text-left transition-all',
                                  selected
                                    ? 'border-[#10233f] bg-[#10233f] text-white shadow-md'
                                    : 'border-[#e8dfd1] bg-[#faf7f2] text-[#10233f] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <p className={cn('text-[11px] font-semibold uppercase tracking-wider', selected ? 'text-[#93aacb]' : 'text-[#9a825f]')}>
                                      {item.category}
                                    </p>
                                    <p className="mt-0.5 text-sm font-semibold">{item.name}</p>
                                  </div>
                                  {selected ? (
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                                      <Check className="h-3.5 w-3.5" />
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                            )
                          })
                        ) : (
                          <EmptyCard message="No poster types found. Add presets from settings." />
                        )}
                      </div>
                    </section>

                    {/* Design styles */}
                    <section className="space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c6603d] text-white">
                          <Palette className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#10233f]">Design Style</h3>
                          <p className="text-xs text-[#5d6777]">Set the visual tone & personality</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {designStyles.length ? (
                          designStyles.map((item) => {
                            const selected = selectedDesignStyleValue?.name === item.name
                            return (
                              <button
                                key={item.name}
                                type="button"
                                onClick={() => setSelectedDesignStyle(item.name)}
                                className={cn(
                                  'w-full rounded-xl border px-4 py-3 text-left transition-all',
                                  selected
                                    ? 'border-[#c6603d] bg-[#c6603d] text-white shadow-md'
                                    : 'border-[#e8dfd1] bg-[#faf7f2] text-[#10233f] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold">{item.name}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {item.traits.slice(0, 3).map((trait) => (
                                        <span
                                          key={trait}
                                          className={cn(
                                            'rounded-full px-2 py-0.5 text-[11px] font-medium',
                                            selected ? 'bg-white/20 text-white' : 'bg-[#ede6da] text-[#7b6b56]',
                                          )}
                                        >
                                          {trait}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  {selected ? (
                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/20">
                                      <Check className="h-3.5 w-3.5" />
                                    </div>
                                  ) : (
                                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#c4b8a6]" />
                                  )}
                                </div>
                              </button>
                            )
                          })
                        ) : (
                          <EmptyCard message="No design styles found. Add presets from settings." />
                        )}
                      </div>
                    </section>
                  </div>
                ) : null}

                {/* ── STEP 2: Canvas ── */}
                {!isLoadingFormats && activeStep === 2 ? (
                  <div className="space-y-6">
                    {formats.length === 0 ? (
                      <EmptyCard message="No saved poster sizes found. Add presets from settings first." />
                    ) : null}
                    {Object.entries(groupedFormats).map(([category, items]) => (
                      <section key={category} className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-[#8b7559]">{category}</p>
                            <p className="mt-0.5 text-xs text-[#5d6777]">Select one size for the canvas</p>
                          </div>
                          <Badge variant="outline" className="rounded-full border-[#ddd4c6] bg-[#faf7f2] text-xs text-[#8b7559]">
                            {items.length} preset{items.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {items.map((format) => {
                            const isSelected = selectedFormat?.name === format.name
                            return (
                              <button
                                key={`${format.category}-${format.name}`}
                                type="button"
                                onClick={() => setSelectedFormatName(format.name)}
                                className={cn(
                                  'rounded-xl border p-4 text-left transition-all',
                                  isSelected
                                    ? 'border-[#c6603d] bg-[#fff5f0] shadow-md ring-1 ring-[#c6603d]/30'
                                    : 'border-[#e8dfd1] bg-[#faf7f2] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                                )}
                              >
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <div>
                                    <p className="text-sm font-bold text-[#10233f]">{format.name}</p>
                                    <p className="mt-0.5 text-xs text-[#5d6777]">{format.width} × {format.height} px</p>
                                  </div>
                                  <div
                                    className={cn(
                                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                                      isSelected ? 'bg-[#c6603d] text-white' : 'bg-[#ede6da] text-[#8b7559]',
                                    )}
                                  >
                                    {isSelected ? <Check className="h-3.5 w-3.5" /> : <Shapes className="h-3.5 w-3.5" />}
                                  </div>
                                </div>
                                <div className="flex items-center justify-center rounded-lg border border-[#e8dfd1] bg-white px-3 py-3">
                                  <div
                                    className="flex items-center justify-center rounded-lg bg-[#10233f] text-[10px] font-semibold text-white"
                                    style={{
                                      width: Math.max(48, Math.min(120, format.width / 10)),
                                      height: Math.max(64, Math.min(160, format.height / 10)),
                                    }}
                                  >
                                    {format.width}×{format.height}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}

                {/* ── STEP 3: Copy ── */}
                {!isLoadingFormats && activeStep === 3 ? (
                  <div className="grid gap-5 xl:grid-cols-[1fr_280px]">
                    <section className="space-y-4">
                      <div className="space-y-4 rounded-xl border border-[#e8dfd1] bg-[#faf7f2] p-5">
                        <div>
                          <h3 className="text-sm font-bold text-[#10233f]">Copy Fields</h3>
                          <p className="mt-0.5 text-xs text-[#5d6777]">All fields are optional — only fill what you need.</p>
                        </div>
                        <FieldBlock label="Headline" hint="Primary attention-grabber">
                          <Input
                            value={headline}
                            onChange={(e) => setHeadline(e.target.value)}
                            placeholder="Grand Open House This Saturday"
                            className="h-11 rounded-xl border-[#d8cebf] bg-white"
                          />
                        </FieldBlock>
                        <FieldBlock label="Subtitle" hint="Supporting line">
                          <Input
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="Luxury homes, curated spaces"
                            className="h-11 rounded-xl border-[#d8cebf] bg-white"
                          />
                        </FieldBlock>
                        <FieldBlock label="Content" hint="Body copy or offer details">
                          <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Add any body copy, event details, or property highlights here."
                            className="min-h-32 w-full rounded-xl border border-[#d8cebf] bg-white px-4 py-3 text-sm text-[#10233f] outline-none transition focus:border-[#10233f] focus:ring-2 focus:ring-[#dde4ef]"
                          />
                        </FieldBlock>
                      </div>

                      <div className="rounded-xl border border-[#c6603d]/25 bg-[#fdf5f2] p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#c6603d]" />
                          <span className="text-sm font-bold text-[#10233f]">AI Instructions</span>
                          <span className="text-xs text-[#8b7559]">(optional)</span>
                        </div>
                        <p className="text-xs text-[#7a5c4f]">Guide the AI with specific tone, style, or design preferences.</p>
                        <textarea
                          value={aiInstructions}
                          onChange={(e) => setAiInstructions(e.target.value)}
                          placeholder="e.g. Use a warm and luxurious tone. Emphasise exclusivity. Keep the layout minimal."
                          className="min-h-24 w-full rounded-xl border border-[#c6603d]/30 bg-white px-4 py-3 text-sm text-[#10233f] outline-none transition focus:border-[#c6603d] focus:ring-2 focus:ring-[#f3ddd7]"
                        />
                      </div>

                      {/* AI Provider selector */}
                      <div className="rounded-xl border border-[#d7d0c4] bg-white p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-[#10233f]" />
                          <span className="text-sm font-bold text-[#10233f]">AI Provider</span>
                        </div>
                        <p className="text-xs text-[#5d6777]">
                          Choose which AI powers poster generation. Perplexity enhances your brief first, then Gemini renders the image.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedProvider('gemini')}
                            className={cn(
                              'rounded-xl border px-4 py-3 text-left transition-all',
                              selectedProvider === 'gemini'
                                ? 'border-[#10233f] bg-[#10233f] text-white shadow-md'
                                : 'border-[#e8dfd1] bg-[#faf7f2] text-[#10233f] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className={cn('text-xs font-bold uppercase tracking-wider', selectedProvider === 'gemini' ? 'text-[#93aacb]' : 'text-[#9a825f]')}>Google</p>
                                <p className="text-sm font-semibold">Gemini</p>
                              </div>
                              {selectedProvider === 'gemini' && (
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <Check className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedProvider('perplexity')}
                            className={cn(
                              'rounded-xl border px-4 py-3 text-left transition-all',
                              selectedProvider === 'perplexity'
                                ? 'border-[#c6603d] bg-[#c6603d] text-white shadow-md'
                                : 'border-[#e8dfd1] bg-[#faf7f2] text-[#10233f] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className={cn('text-xs font-bold uppercase tracking-wider', selectedProvider === 'perplexity' ? 'text-[#ffd8c8]' : 'text-[#9a825f]')}>Perplexity</p>
                                <p className="text-sm font-semibold">Sonar</p>
                              </div>
                              {selectedProvider === 'perplexity' && (
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <Check className="h-3 w-3" />
                                </div>
                              )}
                            </div>
                          </button>
                        </div>
                        {selectedProvider === 'perplexity' && (
                          <p className="rounded-lg bg-[#fdf5f2] px-3 py-2 text-xs text-[#7a5c4f]">
                            Perplexity Sonar will analyse your brief and write enhanced design direction before Gemini renders the final image.
                          </p>
                        )}
                      </div>
                    </section>

                    <aside className="rounded-xl border border-[#e8dfd1] bg-[#10233f] p-5 text-white">
                      <div className="flex items-center gap-2.5 mb-4">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#10233f]">
                          <NotebookText className="h-4 w-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold">Live Preview</h3>
                          <p className="text-xs text-[#93aacb]">See your copy in context</p>
                        </div>
                      </div>
                      <div className="rounded-xl bg-white p-4 text-[#10233f]">
                        <p className="text-xl font-bold leading-tight">{headline.trim() || 'Your Headline'}</p>
                        <p className="mt-2 text-sm text-[#5d6777]">{subtitle.trim() || 'Subtitle goes here'}</p>
                        <p className="mt-2 text-xs leading-5 text-[#465163]">{content.trim() || 'Body content will appear here.'}</p>
                      </div>
                    </aside>
                  </div>
                ) : null}

                {/* ── STEP 4: Branding ── */}
                {!isLoadingFormats && activeStep === 4 ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed border-[#c4b8a6] bg-[#faf7f2] px-5 py-4">
                      <div>
                        <h3 className="text-sm font-bold text-[#10233f]">Attach Logos</h3>
                        <p className="mt-0.5 text-xs text-[#5d6777]">Upload multiple files and manage them visually before generation.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#18355f] transition-colors">
                        <ImagePlus className="h-4 w-4" />
                        Upload Logos
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => handleLogoUpload(e.target.files)}
                        />
                      </label>
                    </div>

                    {logos.length ? (
                      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {logos.map((logo) => (
                          <article key={logo.id} className="overflow-hidden rounded-xl border border-[#e8dfd1] bg-white shadow-sm">
                            <div className="flex h-44 items-center justify-center bg-[#faf7f2] p-4">
                              <img
                                src={logo.previewUrl}
                                alt={logo.file.name}
                                className="max-h-full max-w-full rounded-lg object-contain"
                              />
                            </div>
                            <div className="space-y-3 p-4">
                              <div>
                                <p className="truncate text-sm font-semibold text-[#10233f]">{logo.file.name}</p>
                                <p className="text-xs text-[#8b7559]">{Math.round(logo.file.size / 1024)} KB</p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full rounded-lg border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                onClick={() => removeLogo(logo.id)}
                              >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                Remove
                              </Button>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <EmptyCard message="Your uploaded logos will appear here with instant preview and remove actions." />
                    )}
                  </div>
                ) : null}

                {/* ── STEP 5: Scene ── */}
                {!isLoadingFormats && activeStep === 5 ? (
                  <div className="space-y-5">
                    {/* Mode selector */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setSceneMode('background')}
                        className={cn(
                          'rounded-xl border p-4 text-left transition-all',
                          sceneMode === 'background'
                            ? 'border-[#10233f] bg-[#10233f] text-white shadow-md'
                            : 'border-[#e8dfd1] bg-[#faf7f2] text-[#10233f] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={cn('text-[11px] font-bold uppercase tracking-wider', sceneMode === 'background' ? 'text-[#93aacb]' : 'text-[#9a825f]')}>
                              Full Canvas
                            </p>
                            <p className="mt-0.5 text-sm font-semibold">Background Photo</p>
                            <p className={cn('mt-1.5 text-xs leading-relaxed', sceneMode === 'background' ? 'text-[#8faac8]' : 'text-[#8b7559]')}>
                              Photo fills the entire poster. Text and design elements are placed on top of it.
                            </p>
                          </div>
                          {sceneMode === 'background' && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSceneMode('feature')}
                        className={cn(
                          'rounded-xl border p-4 text-left transition-all',
                          sceneMode === 'feature'
                            ? 'border-[#c6603d] bg-[#c6603d] text-white shadow-md'
                            : 'border-[#e8dfd1] bg-[#faf7f2] text-[#10233f] hover:border-[#c4b8a6] hover:bg-[#f5ede4]',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className={cn('text-[11px] font-bold uppercase tracking-wider', sceneMode === 'feature' ? 'text-[#ffd8c8]' : 'text-[#9a825f]')}>
                              Visual Element
                            </p>
                            <p className="mt-0.5 text-sm font-semibold">Featured Image</p>
                            <p className={cn('mt-1.5 text-xs leading-relaxed', sceneMode === 'feature' ? 'text-[#fde3d9]' : 'text-[#8b7559]')}>
                              Photo becomes a key visual in the layout — displayed alongside text and design.
                            </p>
                          </div>
                          {sceneMode === 'feature' && (
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                      </button>
                    </div>

                    {/* Upload / preview */}
                    {!scenePhoto ? (
                      <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[#d6c9b4] bg-[#faf7f2] text-center transition-colors hover:border-[#b0a087] hover:bg-[#f5ede4]">
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#10233f] text-white shadow-md">
                          <Camera className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#10233f]">Upload Photo</p>
                          <p className="mt-0.5 text-xs text-[#8b7559]">JPG, PNG, WEBP · High resolution recommended</p>
                        </div>
                        <span className="rounded-xl bg-[#10233f] px-4 py-2 text-xs font-semibold text-white">
                          Choose File
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => e.target.files?.[0] && attachScenePhoto(e.target.files[0])}
                        />
                      </label>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[#e8dfd1] bg-white shadow-sm">
                        <div className="relative">
                          <img
                            src={scenePhoto.previewUrl}
                            alt="Scene photo"
                            className="h-64 w-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-4">
                            <div>
                              <p className="text-sm font-semibold text-white drop-shadow">{scenePhoto.file.name}</p>
                              <p className="text-xs text-white/80">{Math.round(scenePhoto.file.size / 1024)} KB</p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg border-white/30 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25 hover:text-white"
                              onClick={removeScenePhoto}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              Remove
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 border-t border-[#ede6da] bg-[#faf7f2] px-4 py-3">
                          <div className={cn('h-2 w-2 shrink-0 rounded-full', sceneMode === 'background' ? 'bg-[#10233f]' : 'bg-[#c6603d]')} />
                          <p className="text-xs text-[#5d6777]">
                            {sceneMode === 'background'
                              ? 'This photo will fill the poster background. The AI will layer text and design on top of it.'
                              : 'This photo will be incorporated as a featured visual element within the poster.'}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-[#e8dfd1] bg-[#faf7f2] px-4 py-3">
                      <p className="text-xs text-[#5d6777]">
                        <span className="font-semibold text-[#10233f]">Optional step.</span>{' '}
                        Skip if you want the AI to create the visuals from scratch.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* ── STEP 6: People ── */}
                {!isLoadingFormats && activeStep === 6 ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#e8dfd1] bg-[#faf7f2] px-5 py-4">
                      <div>
                        <h3 className="text-sm font-bold text-[#10233f]">People Profiles</h3>
                        <p className="mt-0.5 text-xs text-[#5d6777]">Each person can have a photo plus optional name, company, and title.</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-xl bg-[#c6603d] text-white hover:bg-[#ae5536]"
                        onClick={addPerson}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add Person
                      </Button>
                    </div>

                    <div className="space-y-4">
                      {people.map((person, index) => (
                        <article
                          key={person.id}
                          className="grid gap-5 rounded-xl border border-[#e8dfd1] bg-white p-5 shadow-sm lg:grid-cols-[200px_1fr]"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-wider text-[#8b7559]">Person {index + 1}</p>
                                <p className="text-xs text-[#5d6777]">Photo & profile</p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full text-red-500 hover:bg-red-50 hover:text-red-600"
                                onClick={() => removePerson(person.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="overflow-hidden rounded-xl border border-dashed border-[#d6c9b4] bg-[#faf7f2]">
                              {person.photo ? (
                                <div className="space-y-3 p-3">
                                  <img
                                    src={person.photo.previewUrl}
                                    alt={person.name || `Person ${index + 1}`}
                                    className="h-44 w-full rounded-lg object-cover"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-full rounded-lg border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                    onClick={() => removePersonPhoto(person.id)}
                                  >
                                    Remove Photo
                                  </Button>
                                </div>
                              ) : (
                                <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 p-5 text-center text-[#5d6777]">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#10233f] text-white">
                                    <UserRound className="h-5 w-5" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-[#10233f]">Upload Photo</p>
                                    <p className="mt-0.5 text-xs">Square or portrait works best</p>
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => attachPersonPhoto(person.id, e.target.files?.[0] ?? null)}
                                  />
                                </label>
                              )}
                            </div>
                          </div>

                          <div className="grid content-start gap-4 sm:grid-cols-2">
                            <FieldBlock label="Name" hint="Optional">
                              <Input
                                value={person.name}
                                onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
                                placeholder="Jane Doe"
                                className="h-11 rounded-xl border-[#d8cebf] bg-[#faf7f2]"
                              />
                            </FieldBlock>
                            <FieldBlock label="Job Title" hint="Optional">
                              <Input
                                value={person.jobTitle}
                                onChange={(e) => updatePerson(person.id, 'jobTitle', e.target.value)}
                                placeholder="Property Consultant"
                                className="h-11 rounded-xl border-[#d8cebf] bg-[#faf7f2]"
                              />
                            </FieldBlock>
                            <div className="sm:col-span-2">
                              <FieldBlock label="Company" hint="Optional">
                                <Input
                                  value={person.company}
                                  onChange={(e) => updatePerson(person.id, 'company', e.target.value)}
                                  placeholder="HomesDrives Realty"
                                  className="h-11 rounded-xl border-[#d8cebf] bg-[#faf7f2]"
                                />
                              </FieldBlock>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ── Card footer: Navigation ── */}
              <div className="flex items-center justify-between gap-4 border-t border-[#ede6da] bg-[#faf7f2] px-6 py-4 md:px-8">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-[#d8cebf] text-[#10233f] hover:bg-[#f5ede4]"
                  onClick={goToPreviousStep}
                  disabled={activeStep === 1}
                >
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                  Previous
                </Button>

                <div className="flex items-center gap-3">
                  {generatedPosterUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl text-[#5d6777]"
                      onClick={() => { setGeneratedPosterUrl(null); setGenerationError('') }}
                    >
                      Start Over
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-xl text-[#5d6777] hover:text-[#10233f]"
                    >
                      Save Draft
                    </Button>
                  )}

                  {activeStep < STEPS.length ? (
                    <Button
                      type="button"
                      className="rounded-xl bg-[#10233f] text-white hover:bg-[#18355f]"
                      onClick={goToNextStep}
                    >
                      Next Step
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="rounded-xl bg-[#c6603d] px-6 text-white hover:bg-[#ae5536] disabled:opacity-60"
                      onClick={handleGenerate}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          Generating Poster…
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-1.5 h-4 w-4" />
                          Generate Poster
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Generation error */}
            {generationError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
                <strong className="font-semibold">Generation failed: </strong>{generationError}
              </div>
            ) : null}
          </div>

          {/* ── RIGHT: Summary sidebar (xl+) ── */}
          <aside className="hidden xl:block">
            <div className="sticky top-6 space-y-4">
              {/* Brief snapshot */}
              <div className="rounded-2xl border border-[#d7d0c4] bg-white p-5 shadow-sm">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#8b7559]">Brief Snapshot</p>
                <div className="space-y-2">
                  <SummaryRow icon={<LayoutTemplate className="h-4 w-4" />} label="Poster Type" value={selectedPosterTypeValue?.name || '—'} />
                  <SummaryRow icon={<Palette className="h-4 w-4" />} label="Design Style" value={selectedDesignStyleValue?.name || '—'} />
                  <SummaryRow
                    icon={<Shapes className="h-4 w-4" />}
                    label="Canvas Size"
                    value={selectedFormat ? `${selectedFormat.name} · ${selectedFormat.width}×${selectedFormat.height}` : '—'}
                  />
                  <SummaryRow
                    icon={<NotebookText className="h-4 w-4" />}
                    label="Copy Blocks"
                    value={`${[headline, subtitle, content].filter((v) => v.trim()).length} filled`}
                  />
                  <SummaryRow icon={<ImagePlus className="h-4 w-4" />} label="Logos" value={`${logos.length} uploaded`} />
                  <SummaryRow
                    icon={<Camera className="h-4 w-4" />}
                    label="Scene Photo"
                    value={scenePhoto ? `${sceneMode === 'background' ? 'Background' : 'Featured'} · 1 photo` : 'None'}
                  />
                  <SummaryRow
                    icon={<Building2 className="h-4 w-4" />}
                    label="People"
                    value={`${people.filter((p) => p.photo || p.name.trim() || p.company.trim() || p.jobTitle.trim()).length} drafted`}
                  />
                  <SummaryRow
                    icon={<Sparkles className="h-4 w-4" />}
                    label="AI Provider"
                    value={selectedProvider === 'perplexity' ? 'Perplexity + Gemini' : 'Gemini'}
                  />
                </div>
              </div>

              {/* Visual direction */}
              <div className="rounded-2xl bg-[#10233f] p-5 text-white">
                <p className="mb-4 text-[11px] font-bold uppercase tracking-widest text-[#8fb3d9]">Visual Direction</p>
                <div className="space-y-3">
                  <div className="rounded-xl bg-white/8 p-4">
                    <p className="text-xs font-semibold text-[#93aacb]">Design Style</p>
                    <p className="mt-1 text-sm font-medium">{selectedDesignStyleValue?.name || 'Not selected yet'}</p>
                  </div>
                  {selectedDesignStyleValue?.traits?.length ? (
                    <div className="rounded-xl bg-white/8 p-4">
                      <p className="mb-2 text-xs font-semibold text-[#93aacb]">Style Traits</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDesignStyleValue.traits.slice(0, 5).map((trait) => (
                          <span key={trait} className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] text-[#dde8f5]">
                            {trait}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-xl bg-[#c6603d] p-4">
                    <div className="flex items-start gap-2.5">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="text-sm leading-5">
                        {activeStep === STEPS.length
                          ? "Ready to generate! Click the button when you're done."
                          : `${STEPS.length - activeStep} step${STEPS.length - activeStep !== 1 ? 's' : ''} remaining. Fill them in then generate.`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ── Generated poster result ── */}
        {generatedPosterUrl ? (
          <div className="mt-6 space-y-4">
            {/* Result header */}
            <div className="overflow-hidden rounded-2xl border border-[#d7d0c4] bg-white shadow-[0_4px_32px_-8px_rgba(16,35,63,0.14)]">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ede6da] px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#c6603d] text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#10233f]">Generated Poster</h3>
                    <p className="text-sm text-[#5d6777]">
                      {isEditing ? 'Edit mode — move, resize, add text or images, then export.' : 'Your AI-generated poster is ready to download or edit.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl border-[#d8cebf] text-[#10233f] hover:bg-[#faf7f2]"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    className={cn(
                      'rounded-xl px-4 text-sm font-semibold transition-colors',
                      isEditing
                        ? 'bg-[#faf7f2] text-[#10233f] border border-[#d8cebf] hover:bg-[#f0e8db]'
                        : 'bg-[#c6603d] text-white hover:bg-[#ae5536]',
                    )}
                    onClick={() => setIsEditing((v) => !v)}
                  >
                    {isEditing ? 'Close Editor' : '✏️ Edit Poster'}
                  </Button>
                  {!isEditing && (
                    <a
                      href={generatedPosterUrl}
                      download="poster.png"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#10233f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#18355f]"
                    >
                      Download
                    </a>
                  )}
                </div>
              </div>

              {/* Static preview (shown when not editing) */}
              {!isEditing && (
                <div className="flex items-center justify-center bg-[#faf7f2] p-8 md:p-12">
                  <img
                    src={generatedPosterUrl}
                    alt="Generated poster"
                    className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-[0_20px_60px_-20px_rgba(16,35,63,0.4)]"
                  />
                </div>
              )}
            </div>

            {/* Canvas editor (shown when editing) */}
            {isEditing && (
              <PosterEditor
                posterUrl={generatedPosterUrl}
                posterWidth={selectedFormat?.width ?? 1080}
                posterHeight={selectedFormat?.height ?? 1080}
              />
            )}
          </div>
        ) : null}
      </main>
    </div>
  )
}

function EmptyCard({ message, dark = false }: { message: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-6 text-center text-sm',
        dark ? 'border-white/12 bg-white/8 text-[#d9e1ec]' : 'border-[#e8dfd1] bg-[#faf7f2] text-[#8b7559]',
      )}
    >
      {message}
    </div>
  )
}

function FieldBlock({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-[#10233f]">{label}</label>
        <span className="text-xs text-[#8b7559]">{hint}</span>
      </div>
      {children}
    </div>
  )
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#faf7f2] px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#8b7559] shadow-sm">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8b7559]">{label}</p>
        <p className="truncate text-sm font-medium text-[#10233f]">{value}</p>
      </div>
    </div>
  )
}
