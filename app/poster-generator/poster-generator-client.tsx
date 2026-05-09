'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
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
  eyebrow: string
  title: string
  description: string
}

const STEPS: StepDefinition[] = [
  {
    id: 1,
    eyebrow: 'Direction',
    title: 'Poster type and design style',
    description: 'Choose the campaign intent and the visual attitude before filling any content.',
  },
  {
    id: 2,
    eyebrow: 'Canvas',
    title: 'Poster size',
    description: 'Pick the exact output size and orientation for the final composition.',
  },
  {
    id: 3,
    eyebrow: 'Copy',
    title: 'Headline, subtitle, and content',
    description: 'All copy fields are optional so the layout can stay minimal when needed.',
  },
  {
    id: 4,
    eyebrow: 'Branding',
    title: 'Logo attachments',
    description: 'Upload one or more brand marks and manage them visually before generation.',
  },
  {
    id: 5,
    eyebrow: 'People',
    title: 'Photo person uploader',
    description: 'Add as many people as needed with optional identity details for each profile.',
  },
]

function readAdminContext(): AdminContext | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem('homes-admin-context')
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AdminContext>
    if (!parsed.code || parsed.role !== 'admin') {
      return null
    }

    return parsed as AdminContext
  } catch {
    return null
  }
}

function createPersonDraft(): PersonDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    company: '',
    jobTitle: '',
    photo: null,
  }
}

function createUploadedAsset(file: File): UploadedAsset {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
  }
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
  const [people, setPeople] = useState<PersonDraft[]>([createPersonDraft()])
  const [activeStep, setActiveStep] = useState(1)
  const [isLoadingFormats, setIsLoadingFormats] = useState(true)
  const [error, setError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedPosterUrl, setGeneratedPosterUrl] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState('')
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

        if (!response.ok) {
          throw new Error(data?.error || 'Unable to load AI poster settings.')
        }

        if (!cancelled) {
          const incomingFormats = Array.isArray(data?.settings?.formats?.value)
            ? data.settings.formats.value
            : []
          const incomingPosterTypes = Array.isArray(data?.settings?.posterTypes?.value)
            ? data.settings.posterTypes.value
            : []
          const incomingDesignStyles = Array.isArray(data?.settings?.designStyles?.value)
            ? data.settings.designStyles.value
            : []

          setFormats(incomingFormats)
          setPosterTypes(incomingPosterTypes)
          setDesignStyles(incomingDesignStyles)
          setSelectedFormatName(incomingFormats[0]?.name ?? '')
          setSelectedPosterType(incomingPosterTypes[0]?.name ?? '')
          setSelectedDesignStyle(incomingDesignStyles[0]?.name ?? '')
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load AI poster settings.')
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFormats(false)
        }
      }
    }

    void loadFormats()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    objectUrlsRef.current = [
      ...logos.map((logo) => logo.previewUrl),
      ...people.map((person) => person.photo?.previewUrl).filter((value): value is string => Boolean(value)),
    ]
  }, [logos, people])

  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url)
      }
    }
  }, [])

  const groupedFormats = useMemo(() => {
    return formats.reduce<Record<string, PosterFormat[]>>((accumulator, format) => {
      const category = format.category.trim() || 'Uncategorized'
      accumulator[category] = [...(accumulator[category] ?? []), format]
      return accumulator
    }, {})
  }, [formats])

  const selectedFormat = useMemo(
    () => formats.find((format) => format.name === selectedFormatName) ?? formats[0] ?? null,
    [formats, selectedFormatName],
  )

  const selectedPosterTypeValue = useMemo(
    () => posterTypes.find((type) => type.name === selectedPosterType) ?? posterTypes[0] ?? null,
    [posterTypes, selectedPosterType],
  )

  const selectedDesignStyleValue = useMemo(
    () => designStyles.find((style) => style.name === selectedDesignStyle) ?? designStyles[0] ?? null,
    [designStyles, selectedDesignStyle],
  )

  const completedStepCount = useMemo(() => {
    let total = 0
    if (selectedPosterTypeValue && selectedDesignStyleValue) total += 1
    if (selectedFormat) total += 1
    if (headline.trim() || subtitle.trim() || content.trim()) total += 1
    if (logos.length > 0) total += 1
    if (people.some((person) => person.photo || person.name.trim() || person.company.trim() || person.jobTitle.trim())) total += 1
    return total
  }, [content, headline, logos.length, people, selectedDesignStyleValue, selectedFormat, selectedPosterTypeValue, subtitle])

  const currentStep = STEPS.find((step) => step.id === activeStep) ?? STEPS[0]

  function handleLogoUpload(files: FileList | null) {
    if (!files?.length) return
    const nextAssets = Array.from(files).map(createUploadedAsset)
    setLogos((current) => [...current, ...nextAssets])
  }

  function removeLogo(id: string) {
    setLogos((current) => {
      const logo = current.find((item) => item.id === id)
      if (logo) URL.revokeObjectURL(logo.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  function addPerson() {
    setPeople((current) => [...current, createPersonDraft()])
  }

  function updatePerson(id: string, field: keyof Omit<PersonDraft, 'id' | 'photo'>, value: string) {
    setPeople((current) => current.map((person) => (person.id === id ? { ...person, [field]: value } : person)))
  }

  function attachPersonPhoto(id: string, file: File | null) {
    if (!file) return

    setPeople((current) => current.map((person) => {
      if (person.id !== id) return person
      if (person.photo) URL.revokeObjectURL(person.photo.previewUrl)
      return { ...person, photo: createUploadedAsset(file) }
    }))
  }

  function removePersonPhoto(id: string) {
    setPeople((current) => current.map((person) => {
      if (person.id !== id) return person
      if (person.photo) URL.revokeObjectURL(person.photo.previewUrl)
      return { ...person, photo: null }
    }))
  }

  function removePerson(id: string) {
    setPeople((current) => {
      const person = current.find((item) => item.id === id)
      if (person?.photo) URL.revokeObjectURL(person.photo.previewUrl)
      const next = current.filter((item) => item.id !== id)
      return next.length > 0 ? next : [createPersonDraft()]
    })
  }

  function goToNextStep() {
    setActiveStep((current) => Math.min(current + 1, STEPS.length))
  }

  function goToPreviousStep() {
    setActiveStep((current) => Math.max(current - 1, 1))
  }

  async function handleGenerate() {
    setGenerationError('')
    setGeneratedPosterUrl(null)
    setIsGenerating(true)

    try {
      const form = new FormData()

      form.set('posterType', selectedPosterType)
      form.set('designStyle', selectedDesignStyle)
      form.set(
        'designTraits',
        selectedDesignStyleValue?.traits?.join(', ') ?? '',
      )
      form.set('formatName', selectedFormat?.name ?? '')
      form.set('formatWidth', String(selectedFormat?.width ?? ''))
      form.set('formatHeight', String(selectedFormat?.height ?? ''))
      form.set('headline', headline)
      form.set('subtitle', subtitle)
      form.set('content', content)
      form.set('aiInstructions', aiInstructions)
      form.set(
        'people',
        JSON.stringify(
          people.map((p) => ({ name: p.name, company: p.company, jobTitle: p.jobTitle })),
        ),
      )

      logos.forEach((logo, index) => {
        form.set(`logo_${index}`, logo.file)
      })

      people.forEach((person, index) => {
        if (person.photo) {
          form.set(`person_photo_${index}`, person.photo.file)
          form.set(`person_name_${index}`, person.name)
        }
      })

      const response = await fetch('/api/poster-generator/generate', {
        method: 'POST',
        body: form,
      })

      const data = (await response.json().catch(() => null)) as {
        imageData?: string
        mimeType?: string
        error?: string
      } | null

      if (!response.ok || !data?.imageData) {
        throw new Error(data?.error ?? 'Poster generation failed.')
      }

      const dataUrl = `data:${data.mimeType ?? 'image/png'};base64,${data.imageData}`
      setGeneratedPosterUrl(dataUrl)
    } catch (generateError) {
      setGenerationError(
        generateError instanceof Error ? generateError.message : 'Poster generation failed.',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#f3efe7] px-4 py-8 text-slate-950 md:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[36px] border border-[#d7d0c4] bg-[#10233f] text-white shadow-[0_28px_70px_-34px_rgba(16,35,63,0.72)]">
          <div className="grid gap-6 px-6 py-7 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1.2fr)_340px] lg:items-end">
            <div>
              <Badge className="rounded-full bg-[#b88952] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white">
                Poster Questionnaire
              </Badge>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
                Build the poster brief step by step before any generation begins.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d9e1ec] md:text-base">
                This screen is intentionally design-first: a premium guided flow for poster direction,
                sizing, copy, branding, and people assets.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-[#d9e1ec]">
                <div className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">5 guided steps</div>
                <div className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">Optional copy fields</div>
                <div className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5">Multi-logo upload preview</div>
              </div>
            </div>

            <div className="rounded-[28px] bg-[#f7f2e8] p-5 text-[#10233f]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b6b56]">Progress</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <div className="text-4xl font-semibold">{completedStepCount}/5</div>
                  <div className="text-sm text-[#5d6777]">sections holding draft content</div>
                </div>
                <div className="rounded-2xl bg-[#10233f] px-3 py-2 text-sm font-semibold text-white">
                  Step {activeStep}
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[#dfd6c8]">
                <div
                  className="h-full rounded-full bg-[#c6603d] transition-all"
                  style={{ width: `${(completedStepCount / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </header>

        {error ? (
          <section className="rounded-[28px] border border-red-200 bg-[#fff1ee] p-5 text-sm text-red-700 shadow-sm">
            {error}
          </section>
        ) : null}

        <section className="space-y-6">
          <div className="rounded-[30px] border border-[#d7d0c4] bg-white p-4 shadow-[0_20px_50px_-32px_rgba(16,35,63,0.22)] md:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#7b6b56]">Flow</p>
                <p className="mt-2 text-sm text-[#5d6777]">Jump between steps from the top without squeezing the main form area.</p>
              </div>

              <Button asChild variant="outline" className="rounded-2xl border-[#d8cebf] bg-[#fbf8f2] text-[#10233f] hover:bg-[#f3ede4]">
                <Link href="/settings/ai-poster-format-settings">
                  <Cog className="h-4 w-4" />
                  Manage presets
                </Link>
              </Button>
            </div>

            <div className="mt-5 flex gap-3 overflow-x-auto pb-1">
              {STEPS.map((step) => {
                const isActive = step.id === activeStep
                const isCompleted = step.id < activeStep

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className={cn(
                      'min-w-[240px] flex-1 rounded-[24px] border px-4 py-4 text-left transition-colors sm:min-w-[260px]',
                      isActive
                        ? 'border-[#10233f] bg-[#10233f] text-white'
                        : 'border-[#e7e0d5] bg-[#fbf8f2] text-[#10233f] hover:bg-[#f3ede4]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', isActive ? 'text-[#d7e2f3]' : 'text-[#907a5d]')}>
                          {step.eyebrow}
                        </p>
                        <p className="mt-2 text-sm font-semibold leading-5">{step.title}</p>
                        <p className={cn('mt-2 text-xs leading-5', isActive ? 'text-[#d9e1ec]' : 'text-[#5d6777]')}>
                          {step.description}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          isActive
                            ? 'bg-white text-[#10233f]'
                            : isCompleted
                              ? 'bg-[#c6603d] text-white'
                              : 'bg-[#e8dfd1] text-[#6b7280]',
                        )}
                      >
                        {isCompleted ? <Check className="h-4 w-4" /> : step.id}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-[34px] border border-[#d7d0c4] bg-white shadow-[0_24px_60px_-34px_rgba(16,35,63,0.32)]">
            <div className="border-b border-[#ede6da] px-6 py-5 md:px-8 md:py-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8b7559]">{currentStep.eyebrow}</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#10233f]">{currentStep.title}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d6777]">{currentStep.description}</p>
                </div>
                <div className="rounded-[22px] bg-[#f7f2e8] px-4 py-3 text-left sm:text-right">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7559]">Questionnaire</div>
                  <div className="mt-1 text-sm font-semibold text-[#10233f]">Step {activeStep} of {STEPS.length}</div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#dfd6c8] sm:w-44">
                    <div
                      className="h-full rounded-full bg-[#c6603d] transition-all"
                      style={{ width: `${(activeStep / STEPS.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-6 md:px-8 md:py-8">
              {isLoadingFormats ? (
                <div className="rounded-[28px] border border-[#e7e0d5] bg-[#fbf8f2] p-8 text-sm text-[#5d6777]">
                  Loading poster types, sizes, and design styles...
                </div>
              ) : null}

              {!isLoadingFormats && activeStep === 1 ? (
                <div className="grid gap-6 lg:grid-cols-2">
                  <section className="rounded-[28px] border border-[#e7e0d5] bg-[#fbf8f2] p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#10233f] text-white">
                        <LayoutTemplate className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-[#10233f]">Poster type</h3>
                        <p className="text-sm text-[#5d6777]">Select the output intent that best matches the campaign.</p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {posterTypes.length ? (
                        posterTypes.map((item) => {
                          const selected = selectedPosterTypeValue?.name === item.name
                          return (
                            <button
                              key={`${item.category}-${item.name}`}
                              type="button"
                              onClick={() => setSelectedPosterType(item.name)}
                              className={cn(
                                'w-full rounded-[22px] border px-4 py-4 text-left transition-colors',
                                selected
                                  ? 'border-[#10233f] bg-[#10233f] text-white'
                                  : 'border-[#ddd4c6] bg-white text-[#10233f] hover:bg-[#f4eee4]',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', selected ? 'text-[#d9e1ec]' : 'text-[#9a825f]')}>
                                    {item.category}
                                  </p>
                                  <p className="mt-2 text-sm font-semibold">{item.name}</p>
                                </div>
                                {selected ? <Check className="mt-0.5 h-4 w-4" /> : null}
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        <EmptyCard message="No poster types found in settings yet." />
                      )}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-[#e7e0d5] bg-[#10233f] p-5 text-white">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#10233f]">
                        <Palette className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Design style</h3>
                        <p className="text-sm text-[#d9e1ec]">Set the tone and visual personality for the poster.</p>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {designStyles.length ? (
                        designStyles.map((item) => {
                          const selected = selectedDesignStyleValue?.name === item.name
                          return (
                            <button
                              key={item.name}
                              type="button"
                              onClick={() => setSelectedDesignStyle(item.name)}
                              className={cn(
                                'w-full rounded-[22px] border px-4 py-4 text-left transition-colors',
                                selected
                                  ? 'border-[#c6603d] bg-[#c6603d] text-white'
                                  : 'border-white/12 bg-white/8 text-white hover:bg-white/12',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold">{item.name}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {item.traits.slice(0, 3).map((trait) => (
                                      <span key={trait} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', selected ? 'bg-white/18 text-white' : 'bg-[#173050] text-[#d6dfeb]')}>
                                        {trait}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                {selected ? <Check className="mt-0.5 h-4 w-4" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-white/45" />}
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        <EmptyCard dark message="No design styles found in settings yet." />
                      )}
                    </div>
                  </section>
                </div>
              ) : null}

              {!isLoadingFormats && activeStep === 2 ? (
                <div className="space-y-6">
                  {formats.length === 0 ? <EmptyCard message="No saved poster sizes found. Add presets from settings first." /> : null}
                  {Object.entries(groupedFormats).map(([category, items]) => (
                    <section key={category} className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7559]">{category}</p>
                          <p className="mt-1 text-sm text-[#5d6777]">Choose one size preset for the working canvas.</p>
                        </div>
                        <Badge variant="outline" className="rounded-full border-[#ddd4c6] bg-[#fbf8f2] px-3 py-1 text-[#7b6b56]">
                          {items.length} presets
                        </Badge>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((format) => {
                          const isSelected = selectedFormat?.name === format.name

                          return (
                            <button
                              key={`${format.category}-${format.name}`}
                              type="button"
                              onClick={() => setSelectedFormatName(format.name)}
                              className={cn(
                                'rounded-[26px] border p-5 text-left transition-colors',
                                isSelected
                                  ? 'border-[#c6603d] bg-[#fff1eb]'
                                  : 'border-[#e7e0d5] bg-[#fbf8f2] hover:bg-[#f5efe5]',
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-base font-semibold text-[#10233f]">{format.name}</p>
                                  <p className="mt-1 text-sm text-[#5d6777]">{format.width} x {format.height} px</p>
                                </div>
                                <div className={cn('flex h-9 w-9 items-center justify-center rounded-full', isSelected ? 'bg-[#10233f] text-white' : 'bg-white text-[#8b7559]')}>
                                  {isSelected ? <Check className="h-4 w-4" /> : <Shapes className="h-4 w-4" />}
                                </div>
                              </div>
                              <div className="mt-5 rounded-[22px] border border-[#e2d9cc] bg-white px-4 py-4">
                                <div
                                  className="mx-auto flex items-center justify-center rounded-2xl bg-[#10233f] text-xs font-semibold text-white"
                                  style={{
                                    width: Math.max(72, Math.min(170, format.width / 8)),
                                    height: Math.max(96, Math.min(220, format.height / 8)),
                                  }}
                                >
                                  {format.width} x {format.height}
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

              {!isLoadingFormats && activeStep === 3 ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                  <section className="space-y-4 rounded-[28px] border border-[#e7e0d5] bg-[#fbf8f2] p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-[#10233f]">Optional copy fields</h3>
                      <p className="mt-1 text-sm text-[#5d6777]">Only fill the fields needed for this poster. Empty fields are valid.</p>
                    </div>

                    <div className="space-y-4">
                      <FieldBlock label="Headline" hint="Primary attention-grabber for the composition.">
                        <Input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Grand Open House This Saturday" className="h-12 rounded-2xl border-[#d8cebf] bg-white" />
                      </FieldBlock>

                      <FieldBlock label="Subtitle" hint="Supporting line or short event detail.">
                        <Input value={subtitle} onChange={(event) => setSubtitle(event.target.value)} placeholder="Luxury homes, curated spaces, and a polished first impression" className="h-12 rounded-2xl border-[#d8cebf] bg-white" />
                      </FieldBlock>

                      <FieldBlock label="Content" hint="Longer body copy, bullet text, or offer details.">
                        <textarea
                          value={content}
                          onChange={(event) => setContent(event.target.value)}
                          placeholder="Add any body copy, promo details, event schedule, or property highlights here."
                          className="min-h-40 w-full rounded-[24px] border border-[#d8cebf] bg-white px-4 py-3 text-sm text-[#10233f] outline-none transition focus:border-[#10233f] focus:ring-4 focus:ring-[#dde4ef]"
                        />
                      </FieldBlock>
                    </div>

                    <div className="rounded-[24px] border border-[#c6603d]/30 bg-[#fdf3ef] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[#c6603d]" />
                        <span className="text-sm font-semibold text-[#10233f]">Additional AI instructions</span>
                      </div>
                      <p className="text-xs text-[#7a5c4f]">Guide the AI with specific tone, style, or design preferences. This field is optional.</p>
                      <textarea
                        value={aiInstructions}
                        onChange={(event) => setAiInstructions(event.target.value)}
                        placeholder="e.g. Use a warm and luxurious tone. Emphasise exclusivity. Keep the layout minimal with lots of white space."
                        className="min-h-28 w-full rounded-[20px] border border-[#c6603d]/40 bg-white px-4 py-3 text-sm text-[#10233f] outline-none transition focus:border-[#c6603d] focus:ring-4 focus:ring-[#f3ddd7]"
                      />
                    </div>
                  </section>

                  <aside className="rounded-[28px] border border-[#e7e0d5] bg-[#10233f] p-5 text-white">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-[#10233f]">
                        <NotebookText className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">Preview tone</h3>
                        <p className="text-sm text-[#d9e1ec]">A compact feel for the content hierarchy.</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[24px] bg-white p-5 text-[#10233f]">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9a825f]">Live copy preview</p>
                      <div className="mt-4 space-y-3">
                        <p className="text-2xl font-semibold leading-tight">{headline.trim() || 'Your headline can stay bold and focused.'}</p>
                        <p className="text-sm text-[#5d6777]">{subtitle.trim() || 'Subtitles are optional and can carry context, date, or a short supporting line.'}</p>
                        <p className="text-sm leading-6 text-[#465163]">{content.trim() || 'Body content can be omitted entirely or used for richer campaign messaging.'}</p>
                      </div>
                    </div>
                  </aside>
                </div>
              ) : null}

              {!isLoadingFormats && activeStep === 4 ? (
                <div className="space-y-6">
                  <section className="rounded-[28px] border border-dashed border-[#cbbba4] bg-[#fbf8f2] p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-[#10233f]">Attach logos</h3>
                        <p className="mt-1 text-sm text-[#5d6777]">Upload multiple files, preview them immediately, and remove any logo when needed.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-[#10233f] px-4 py-3 text-sm font-semibold text-white hover:bg-[#18355f]">
                        <ImagePlus className="h-4 w-4" />
                        Upload logos
                        <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleLogoUpload(event.target.files)} />
                      </label>
                    </div>
                  </section>

                  {logos.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {logos.map((logo) => (
                        <article key={logo.id} className="overflow-hidden rounded-[28px] border border-[#e7e0d5] bg-white shadow-[0_16px_40px_-30px_rgba(16,35,63,0.3)]">
                          <div className="flex h-52 items-center justify-center bg-[#f6f1e7] p-4">
                            <img src={logo.previewUrl} alt={logo.file.name} className="max-h-full max-w-full rounded-2xl object-contain" />
                          </div>
                          <div className="space-y-3 p-4">
                            <div>
                              <p className="truncate text-sm font-semibold text-[#10233f]">{logo.file.name}</p>
                              <p className="mt-1 text-xs text-[#6b7280]">{Math.round(logo.file.size / 1024)} KB</p>
                            </div>
                            <Button type="button" variant="outline" className="w-full rounded-2xl border-red-200 bg-[#fff1ee] text-red-700 hover:bg-[#ffe4df] hover:text-red-800" onClick={() => removeLogo(logo.id)}>
                              <Trash2 className="h-4 w-4" />
                              Delete logo
                            </Button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyCard message="Your uploaded logos will appear here with instant preview and delete actions." />
                  )}
                </div>
              ) : null}

              {!isLoadingFormats && activeStep === 5 ? (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-[#e7e0d5] bg-[#fbf8f2] p-5">
                    <div>
                      <h3 className="text-lg font-semibold text-[#10233f]">People blocks</h3>
                      <p className="mt-1 text-sm text-[#5d6777]">Each person can include a photo plus optional name, company, and job title.</p>
                    </div>
                    <Button type="button" onClick={addPerson} className="rounded-2xl bg-[#c6603d] text-white hover:bg-[#ae5536]">
                      <Plus className="h-4 w-4" />
                      Add person
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {people.map((person, index) => (
                      <article key={person.id} className="grid gap-5 rounded-[30px] border border-[#e7e0d5] bg-white p-5 shadow-[0_18px_44px_-30px_rgba(16,35,63,0.28)] lg:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7559]">Person {index + 1}</p>
                              <p className="mt-1 text-sm text-[#5d6777]">Photo and profile details</p>
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="rounded-full text-red-600 hover:bg-[#fff1ee] hover:text-red-700" onClick={() => removePerson(person.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="overflow-hidden rounded-[24px] border border-dashed border-[#d6c9b4] bg-[#f6f1e7]">
                            {person.photo ? (
                              <div className="space-y-3 p-3">
                                <img src={person.photo.previewUrl} alt={person.name || `Person ${index + 1}`} className="h-52 w-full rounded-[18px] object-cover" />
                                <Button type="button" variant="outline" className="w-full rounded-2xl border-red-200 bg-[#fff1ee] text-red-700 hover:bg-[#ffe4df] hover:text-red-800" onClick={() => removePersonPhoto(person.id)}>
                                  Remove photo
                                </Button>
                              </div>
                            ) : (
                              <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 p-6 text-center text-[#5d6777]">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#10233f] text-white">
                                  <UserRound className="h-6 w-6" />
                                </div>
                                <div>
                                  <p className="font-semibold text-[#10233f]">Upload person photo</p>
                                  <p className="mt-1 text-sm">Square or portrait images work well here.</p>
                                </div>
                                <input type="file" accept="image/*" className="hidden" onChange={(event) => attachPersonPhoto(person.id, event.target.files?.[0] ?? null)} />
                              </label>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <FieldBlock label="Name" hint="Optional display name.">
                            <Input value={person.name} onChange={(event) => updatePerson(person.id, 'name', event.target.value)} placeholder="Jane Doe" className="h-12 rounded-2xl border-[#d8cebf] bg-[#fbf8f2]" />
                          </FieldBlock>
                          <FieldBlock label="Job title" hint="Optional role or position.">
                            <Input value={person.jobTitle} onChange={(event) => updatePerson(person.id, 'jobTitle', event.target.value)} placeholder="Property Consultant" className="h-12 rounded-2xl border-[#d8cebf] bg-[#fbf8f2]" />
                          </FieldBlock>
                          <div className="sm:col-span-2">
                            <FieldBlock label="Company" hint="Optional brand, brokerage, or organization.">
                              <Input value={person.company} onChange={(event) => updatePerson(person.id, 'company', event.target.value)} placeholder="HomesDrives Realty" className="h-12 rounded-2xl border-[#d8cebf] bg-[#fbf8f2]" />
                            </FieldBlock>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ede6da] px-6 py-5 md:px-8">
              <Button type="button" variant="outline" className="rounded-2xl border-[#d8cebf] bg-[#fbf8f2] text-[#10233f] hover:bg-[#f3ede4]" onClick={goToPreviousStep} disabled={activeStep === 1}>
                <ArrowLeft className="h-4 w-4" />
                Previous step
              </Button>

              <div className="flex flex-wrap items-center gap-3">
                {generatedPosterUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-[#d8cebf] bg-white text-[#10233f] hover:bg-[#fbf8f2]"
                    onClick={() => {
                      setGeneratedPosterUrl(null)
                      setGenerationError('')
                    }}
                  >
                    Start over
                  </Button>
                ) : (
                  <Button type="button" variant="outline" className="rounded-2xl border-[#d8cebf] bg-white text-[#10233f] hover:bg-[#fbf8f2]">
                    Save as draft
                  </Button>
                )}

                {activeStep < STEPS.length ? (
                  <Button type="button" className="rounded-2xl bg-[#10233f] text-white hover:bg-[#18355f]" onClick={goToNextStep}>
                    Next step
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="rounded-2xl bg-[#c6603d] text-white hover:bg-[#ae5536] disabled:opacity-60"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Generating poster…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate poster
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </section>

            <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <section className="rounded-[30px] border border-[#d7d0c4] bg-white p-5 shadow-[0_20px_50px_-32px_rgba(16,35,63,0.28)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b7559]">Brief snapshot</p>
              <div className="mt-4 space-y-3 text-sm text-[#5d6777]">
                <SummaryRow icon={<LayoutTemplate className="h-4 w-4" />} label="Poster type" value={selectedPosterTypeValue?.name || 'Not selected'} />
                <SummaryRow icon={<Palette className="h-4 w-4" />} label="Design style" value={selectedDesignStyleValue?.name || 'Not selected'} />
                <SummaryRow icon={<Shapes className="h-4 w-4" />} label="Size" value={selectedFormat ? `${selectedFormat.name} · ${selectedFormat.width} x ${selectedFormat.height}` : 'Not selected'} />
                <SummaryRow icon={<NotebookText className="h-4 w-4" />} label="Copy blocks" value={`${[headline, subtitle, content].filter((value) => value.trim()).length} filled`} />
                <SummaryRow icon={<ImagePlus className="h-4 w-4" />} label="Logos" value={`${logos.length} uploaded`} />
                <SummaryRow icon={<Building2 className="h-4 w-4" />} label="People" value={`${people.filter((person) => person.photo || person.name.trim() || person.company.trim() || person.jobTitle.trim()).length} drafted`} />
              </div>
            </section>

            <section className="rounded-[30px] border border-[#d7d0c4] bg-[#10233f] p-5 text-white shadow-[0_20px_50px_-34px_rgba(16,35,63,0.48)]">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d7e2f3]">Visual direction</p>
              <div className="mt-4 space-y-4">
                <div className="rounded-[24px] bg-white/8 p-4">
                  <p className="text-sm font-semibold">Selected style</p>
                  <p className="mt-1 text-sm text-[#d9e1ec]">{selectedDesignStyleValue?.name || 'Choose a style in step 1.'}</p>
                </div>
                <div className="rounded-[24px] bg-white/8 p-4">
                  <p className="text-sm font-semibold">Traits</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedDesignStyleValue?.traits?.length ? (
                      selectedDesignStyleValue.traits.slice(0, 6).map((trait) => (
                        <span key={trait} className="rounded-full bg-white/12 px-2.5 py-1 text-[11px] text-[#e5edf8]">
                          {trait}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-[#d9e1ec]">Traits will show here once a design style is selected.</span>
                    )}
                  </div>
                </div>
                <div className="rounded-[24px] bg-[#c6603d] p-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5" />
                    <p className="text-sm leading-6 text-white">
                      {activeStep === STEPS.length
                        ? 'Complete all steps and click Generate poster to create your AI-powered design.'
                        : 'This is a design-first flow. Complete all steps then generate the poster.'}
                    </p>
                  </div>
                </div>
              </div>
            </section>
            </aside>
          </section>

          {/* Generation error */}
          {generationError ? (
            <section className="rounded-[28px] border border-red-200 bg-[#fff1ee] p-5 text-sm text-red-700">
              <strong className="font-semibold">Generation failed: </strong>{generationError}
            </section>
          ) : null}

          {/* Generated poster result */}
          {generatedPosterUrl ? (
            <section className="overflow-hidden rounded-[34px] border border-[#d7d0c4] bg-white shadow-[0_24px_60px_-34px_rgba(16,35,63,0.32)]">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ede6da] px-6 py-5 md:px-8">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#c6603d] text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-[#10233f]">Generated poster</h3>
                    <p className="text-sm text-[#5d6777]">Your AI-generated poster is ready. Download or regenerate below.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-2xl border-[#d8cebf] bg-[#fbf8f2] text-[#10233f] hover:bg-[#f3ede4]"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    <Sparkles className="h-4 w-4" />
                    Regenerate
                  </Button>
                  <a
                    href={generatedPosterUrl}
                    download="poster.png"
                    className="inline-flex items-center gap-2 rounded-2xl bg-[#10233f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#18355f]"
                  >
                    Download poster
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-center bg-[#f6f1e7] p-6 md:p-10">
                <img
                  src={generatedPosterUrl}
                  alt="Generated poster"
                  className="max-h-[80vh] max-w-full rounded-[24px] object-contain shadow-[0_32px_80px_-30px_rgba(16,35,63,0.45)]"
                />
              </div>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function EmptyCard({ message, dark = false }: { message: string; dark?: boolean }) {
  return (
    <div className={cn('rounded-[24px] border p-5 text-sm', dark ? 'border-white/12 bg-white/8 text-[#d9e1ec]' : 'border-[#e7e0d5] bg-white text-[#5d6777]')}>
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
      <div className="mb-2 flex items-center justify-between gap-3">
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
    <div className="flex items-start gap-3 rounded-[22px] bg-[#fbf8f2] px-4 py-3">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#10233f]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8b7559]">{label}</p>
        <p className="mt-1 truncate text-sm font-medium text-[#10233f]">{value}</p>
      </div>
    </div>
  )
}
