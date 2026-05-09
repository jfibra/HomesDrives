'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Palette,
  PencilLine,
  Plus,
  Save,
  Settings2,
  Shapes,
  Sparkles,
  Trash2,
} from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { PosterDesignStyle, PosterFormat, PosterType } from '@/lib/poster-format-settings'

type AdminContext = {
  code: string
  fullName: string
  firstName: string
  email: string
  role: 'admin' | 'media' | 'customer'
}

type EditablePosterFormat = {
  id: string
  name: string
  width: string
  height: string
  category: string
}

type EditablePosterType = {
  id: string
  category: string
  name: string
}

type EditablePosterDesignStyle = {
  id: string
  name: string
  traitsText: string
}

type SettingsPayload = {
  formats?: { updatedAt?: string | null; value?: PosterFormat[] }
  posterTypes?: { updatedAt?: string | null; value?: PosterType[] }
  designStyles?: { updatedAt?: string | null; value?: PosterDesignStyle[] }
}

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

function createEmptyFormat(): EditablePosterFormat {
  return { id: crypto.randomUUID(), name: '', width: '', height: '', category: '' }
}

function createEmptyPosterType(): EditablePosterType {
  return { id: crypto.randomUUID(), category: '', name: '' }
}

function createEmptyDesignStyle(): EditablePosterDesignStyle {
  return { id: crypto.randomUUID(), name: '', traitsText: '' }
}

function toEditableFormats(items: PosterFormat[]): EditablePosterFormat[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    name: item.name,
    width: String(item.width),
    height: String(item.height),
    category: item.category,
  }))
}

function toEditablePosterTypes(items: PosterType[]): EditablePosterType[] {
  return items.map((item) => ({ id: crypto.randomUUID(), category: item.category, name: item.name }))
}

function toEditableDesignStyles(items: PosterDesignStyle[]): EditablePosterDesignStyle[] {
  return items.map((item) => ({
    id: crypto.randomUUID(),
    name: item.name,
    traitsText: item.traits.join('\n'),
  }))
}

function parseTraits(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeFormatRows(rows: EditablePosterFormat[]) {
  return rows.map((format) => ({
    name: format.name.trim(),
    category: format.category.trim(),
    width: Number(format.width),
    height: Number(format.height),
  }))
}

function normalizePosterTypeRows(rows: EditablePosterType[]) {
  return rows.map((item) => ({ category: item.category.trim(), name: item.name.trim() }))
}

function normalizeDesignStyleRows(rows: EditablePosterDesignStyle[]) {
  return rows.map((item) => ({ name: item.name.trim(), traits: parseTraits(item.traitsText) }))
}

function resolveMostRecentUpdatedAt(payload: SettingsPayload) {
  const candidates = [payload.formats?.updatedAt, payload.posterTypes?.updatedAt, payload.designStyles?.updatedAt]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (candidates.length === 0) return null
  return candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
}

function validateFormatRow(item: EditablePosterFormat) {
  const normalized = normalizeFormatRows([item])[0]
  if (!normalized.name || !normalized.category) return 'Format name and category are required.'
  if (!Number.isFinite(normalized.width) || normalized.width <= 0) return 'Width must be greater than zero.'
  if (!Number.isFinite(normalized.height) || normalized.height <= 0) return 'Height must be greater than zero.'
  return null
}

function validatePosterTypeRow(item: EditablePosterType) {
  const normalized = normalizePosterTypeRows([item])[0]
  if (!normalized.category || !normalized.name) return 'Category and poster type are required.'
  return null
}

function validateDesignStyleRow(item: EditablePosterDesignStyle) {
  const normalized = normalizeDesignStyleRows([item])[0]
  if (!normalized.name) return 'Style name is required.'
  if (normalized.traits.length === 0) return 'Add at least one trait line.'
  return null
}

function StatCard({
  title,
  value,
  description,
  icon,
  tone,
}: {
  title: string
  value: string | number
  description: string
  icon: React.ReactNode
  tone: string
}) {
  return (
    <div className="rounded-[28px] border border-white/60 bg-white/85 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-2 text-sm text-slate-600">{description}</p>
        </div>
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg', tone)}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function EmptyTableState({
  title,
  description,
  colSpan,
}: {
  title: string
  description: string
  colSpan: number
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-14">
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/15">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="mt-4 text-base font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </TableCell>
    </TableRow>
  )
}

function DataTableShell({
  title,
  subtitle,
  count,
  action,
  children,
}: {
  title: string
  subtitle: string
  count: number
  action: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-white/60 bg-white/90 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200/70 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.7))] px-6 py-5">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              {count} {count === 1 ? 'item' : 'items'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="px-3 pb-3 pt-2">{children}</div>
    </section>
  )
}

export default function AIPosterFormatSettingsClient() {
  const [formats, setFormats] = useState<EditablePosterFormat[]>([])
  const [posterTypes, setPosterTypes] = useState<EditablePosterType[]>([])
  const [designStyles, setDesignStyles] = useState<EditablePosterDesignStyle[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [formatDialogOpen, setFormatDialogOpen] = useState(false)
  const [posterTypeDialogOpen, setPosterTypeDialogOpen] = useState(false)
  const [designStyleDialogOpen, setDesignStyleDialogOpen] = useState(false)
  const [formatDialogMode, setFormatDialogMode] = useState<'create' | 'edit'>('create')
  const [posterTypeDialogMode, setPosterTypeDialogMode] = useState<'create' | 'edit'>('create')
  const [designStyleDialogMode, setDesignStyleDialogMode] = useState<'create' | 'edit'>('create')
  const [formatDraft, setFormatDraft] = useState<EditablePosterFormat>(createEmptyFormat())
  const [posterTypeDraft, setPosterTypeDraft] = useState<EditablePosterType>(createEmptyPosterType())
  const [designStyleDraft, setDesignStyleDraft] = useState<EditablePosterDesignStyle>(createEmptyDesignStyle())
  const [formatDialogError, setFormatDialogError] = useState('')
  const [posterTypeDialogError, setPosterTypeDialogError] = useState('')
  const [designStyleDialogError, setDesignStyleDialogError] = useState('')
  const [formatToDelete, setFormatToDelete] = useState<EditablePosterFormat | null>(null)
  const [posterTypeToDelete, setPosterTypeToDelete] = useState<EditablePosterType | null>(null)
  const [designStyleToDelete, setDesignStyleToDelete] = useState<EditablePosterDesignStyle | null>(null)

  useEffect(() => {
    let cancelled = false
    const admin = readAdminContext()

    if (!admin?.code) {
      setError('Admin context was not found. Sign in through the admin console first.')
      setLoading(false)
      return
    }

    const adminCode = admin.code

    async function load() {
      setLoading(true)
      setError('')
      try {
        const search = new URLSearchParams({ adminCode })
        const response = await fetch(`/api/admin/settings/ai-poster-generator-settings?${search}`)
        const data = await response.json().catch(() => null)

        if (!response.ok) throw new Error(data?.error || 'Unable to load AI poster settings.')

        if (!cancelled) {
          const settings = (data?.settings ?? {}) as SettingsPayload
          const incomingFormats = Array.isArray(settings.formats?.value) ? settings.formats.value : []
          const incomingPosterTypes = Array.isArray(settings.posterTypes?.value) ? settings.posterTypes.value : []
          const incomingDesignStyles = Array.isArray(settings.designStyles?.value) ? settings.designStyles.value : []

          setFormats(toEditableFormats(incomingFormats))
          setPosterTypes(toEditablePosterTypes(incomingPosterTypes))
          setDesignStyles(toEditableDesignStyles(incomingDesignStyles))
          setUpdatedAt(resolveMostRecentUpdatedAt(settings))
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load AI poster settings.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  const formatCategoryCounts = useMemo(() => {
    return formats.reduce<Record<string, number>>((acc, item) => {
      const key = item.category.trim() || 'Uncategorized'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
  }, [formats])

  const posterTypeCategoryCounts = useMemo(() => {
    return posterTypes.reduce<Record<string, number>>((acc, item) => {
      const key = item.category.trim() || 'Uncategorized'
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {})
  }, [posterTypes])

  const designStyleTraitCounts = useMemo(() => {
    return designStyles.reduce<Record<string, number>>((acc, item) => {
      acc[item.name.trim() || 'Untitled'] = parseTraits(item.traitsText).length
      return acc
    }, {})
  }, [designStyles])

  function openCreateFormatDialog() {
    setFormatDialogMode('create')
    setFormatDraft(createEmptyFormat())
    setFormatDialogError('')
    setFormatDialogOpen(true)
  }

  function openEditFormatDialog(item: EditablePosterFormat) {
    setFormatDialogMode('edit')
    setFormatDraft({ ...item })
    setFormatDialogError('')
    setFormatDialogOpen(true)
  }

  function submitFormatDraft() {
    const validationError = validateFormatRow(formatDraft)
    if (validationError) {
      setFormatDialogError(validationError)
      return
    }

    setFormats((current) => (
      formatDialogMode === 'edit'
        ? current.map((item) => (item.id === formatDraft.id ? formatDraft : item))
        : [...current, formatDraft]
    ))
    setNotice('')
    setError('')
    setFormatDialogOpen(false)
  }

  function openCreatePosterTypeDialog() {
    setPosterTypeDialogMode('create')
    setPosterTypeDraft(createEmptyPosterType())
    setPosterTypeDialogError('')
    setPosterTypeDialogOpen(true)
  }

  function openEditPosterTypeDialog(item: EditablePosterType) {
    setPosterTypeDialogMode('edit')
    setPosterTypeDraft({ ...item })
    setPosterTypeDialogError('')
    setPosterTypeDialogOpen(true)
  }

  function submitPosterTypeDraft() {
    const validationError = validatePosterTypeRow(posterTypeDraft)
    if (validationError) {
      setPosterTypeDialogError(validationError)
      return
    }

    setPosterTypes((current) => (
      posterTypeDialogMode === 'edit'
        ? current.map((item) => (item.id === posterTypeDraft.id ? posterTypeDraft : item))
        : [...current, posterTypeDraft]
    ))
    setNotice('')
    setError('')
    setPosterTypeDialogOpen(false)
  }

  function openCreateDesignStyleDialog() {
    setDesignStyleDialogMode('create')
    setDesignStyleDraft(createEmptyDesignStyle())
    setDesignStyleDialogError('')
    setDesignStyleDialogOpen(true)
  }

  function openEditDesignStyleDialog(item: EditablePosterDesignStyle) {
    setDesignStyleDialogMode('edit')
    setDesignStyleDraft({ ...item })
    setDesignStyleDialogError('')
    setDesignStyleDialogOpen(true)
  }

  function submitDesignStyleDraft() {
    const validationError = validateDesignStyleRow(designStyleDraft)
    if (validationError) {
      setDesignStyleDialogError(validationError)
      return
    }

    setDesignStyles((current) => (
      designStyleDialogMode === 'edit'
        ? current.map((item) => (item.id === designStyleDraft.id ? designStyleDraft : item))
        : [...current, designStyleDraft]
    ))
    setNotice('')
    setError('')
    setDesignStyleDialogOpen(false)
  }

  async function handleSave() {
    const admin = readAdminContext()
    if (!admin?.code) {
      setError('Admin context was not found. Sign in through the admin console first.')
      return
    }

    const normalizedFormats = normalizeFormatRows(formats)
    const normalizedPosterTypes = normalizePosterTypeRows(posterTypes)
    const normalizedDesignStyles = normalizeDesignStyleRows(designStyles)

    const invalidFormat = normalizedFormats.find((item) => !item.name || !item.category || !Number.isFinite(item.width) || item.width <= 0 || !Number.isFinite(item.height) || item.height <= 0)
    const invalidPosterType = normalizedPosterTypes.find((item) => !item.name || !item.category)
    const invalidDesignStyle = normalizedDesignStyles.find((item) => !item.name || item.traits.length === 0)

    if (invalidFormat) return setError('Each format row needs a name, category, width, and height greater than zero.')
    if (invalidPosterType) return setError('Each poster type row needs a category and type name.')
    if (invalidDesignStyle) return setError('Each design style row needs a style name and at least one trait line.')

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const response = await fetch('/api/admin/settings/ai-poster-generator-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminCode: admin.code,
          formats: normalizedFormats,
          posterTypes: normalizedPosterTypes,
          designStyles: normalizedDesignStyles,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Unable to save AI poster settings.')

      const settings = (data?.settings ?? {}) as SettingsPayload
      const savedFormats = Array.isArray(settings.formats?.value) ? settings.formats.value : []
      const savedPosterTypes = Array.isArray(settings.posterTypes?.value) ? settings.posterTypes.value : []
      const savedDesignStyles = Array.isArray(settings.designStyles?.value) ? settings.designStyles.value : []

      setFormats(toEditableFormats(savedFormats))
      setPosterTypes(toEditablePosterTypes(savedPosterTypes))
      setDesignStyles(toEditableDesignStyles(savedDesignStyles))
      setUpdatedAt(resolveMostRecentUpdatedAt(settings))
      setNotice('AI poster settings saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save AI poster settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(250,204,21,0.16),transparent_24%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-8 text-slate-900 md:px-10">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="relative overflow-hidden rounded-[34px] border border-white/60 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.88))] p-6 text-white shadow-[0_30px_80px_-36px_rgba(15,23,42,0.85)] md:p-8">
            <div className="pointer-events-none absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.18),transparent_68%)]" />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl">
                <Badge className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-100">Settings Console</Badge>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">AI Poster Generator Settings</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
                  Review existing configuration in clean data tables, then add or edit records inside focused modal forms.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 font-medium">
                    <Settings2 className="h-3.5 w-3.5" />
                    Keys: ai_poster_format_settings, ai_poster_type_settings, ai_poster_design_style_settings
                  </span>
                  {updatedAt ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 font-medium text-emerald-100">
                      Last updated: {new Date(updatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  ) : null}
                </div>
              </div>

              <Button
                type="button"
                onClick={handleSave}
                disabled={saving || loading}
                className="rounded-2xl bg-white px-5 text-slate-950 shadow-lg shadow-black/20 hover:bg-slate-100"
              >
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save all changes'}
              </Button>
            </div>
          </header>

          {loading ? (
            <section className="rounded-[28px] border border-white/60 bg-white/85 p-6 text-sm text-slate-600 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.3)] backdrop-blur">
              Loading AI poster settings...
            </section>
          ) : null}

          {!loading && error ? (
            <section className="rounded-[28px] border border-red-200 bg-red-50/90 p-5 text-sm text-red-700 shadow-[0_18px_48px_-28px_rgba(220,38,38,0.32)]">
              {error}
            </section>
          ) : null}

          {!loading && notice ? (
            <section className="rounded-[28px] border border-emerald-200 bg-emerald-50/90 p-5 text-sm text-emerald-700 shadow-[0_18px_48px_-28px_rgba(5,150,105,0.28)]">
              {notice}
            </section>
          ) : null}

          {!loading ? (
            <>
              <section className="grid gap-4 md:grid-cols-3">
                <StatCard
                  title="Format Sizes"
                  value={formats.length}
                  description="Poster dimensions available to the generator."
                  icon={<Shapes className="h-5 w-5" />}
                  tone="bg-[linear-gradient(135deg,#0f172a,#1d4ed8)]"
                />
                <StatCard
                  title="Poster Types"
                  value={posterTypes.length}
                  description="Content categories and promptable poster outputs."
                  icon={<Sparkles className="h-5 w-5" />}
                  tone="bg-[linear-gradient(135deg,#0f766e,#22c55e)]"
                />
                <StatCard
                  title="Design Styles"
                  value={designStyles.length}
                  description="Visual directions with reusable trait lists."
                  icon={<Palette className="h-5 w-5" />}
                  tone="bg-[linear-gradient(135deg,#7c2d12,#f59e0b)]"
                />
              </section>

              <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <Tabs defaultValue="formats" className="w-full">
                    <TabsList className="mb-4 grid h-auto w-full grid-cols-3 rounded-[24px] border border-white/60 bg-white/75 p-1.5 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.28)] backdrop-blur">
                      <TabsTrigger value="formats" className="rounded-[18px] py-3 text-slate-700 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                        Format Sizes
                      </TabsTrigger>
                      <TabsTrigger value="types" className="rounded-[18px] py-3 text-slate-700 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                        Poster Types
                      </TabsTrigger>
                      <TabsTrigger value="styles" className="rounded-[18px] py-3 text-slate-700 data-[state=active]:bg-slate-950 data-[state=active]:text-white">
                        Design Styles
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="formats">
                      <DataTableShell
                        title="Format Sizes"
                        subtitle="Readable dimension data with edit and delete actions pinned to the right."
                        count={formats.length}
                        action={
                          <Button
                            type="button"
                            onClick={openCreateFormatDialog}
                            className="rounded-2xl bg-slate-950 px-4 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-800"
                          >
                            <Plus className="h-4 w-4" />
                            Add Format
                          </Button>
                        }
                      >
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-200/80 hover:bg-transparent">
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Format Name</TableHead>
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Category</TableHead>
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Width</TableHead>
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Height</TableHead>
                              <TableHead className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {formats.length === 0 ? (
                              <EmptyTableState
                                colSpan={5}
                                title="No format sizes yet"
                                description="Add the first format entry to define poster dimensions for the generator."
                              />
                            ) : (
                              formats.map((format) => (
                                <TableRow key={format.id} className="border-slate-100/90 hover:bg-slate-50/80">
                                  <TableCell className="px-4 py-4 font-medium text-slate-950">{format.name}</TableCell>
                                  <TableCell className="px-4 py-4">
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                                      {format.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-4 py-4 text-slate-600">{format.width}px</TableCell>
                                  <TableCell className="px-4 py-4 text-slate-600">{format.height}px</TableCell>
                                  <TableCell className="px-4 py-4">
                                    <div className="flex justify-end gap-2">
                                      <Button type="button" variant="outline" size="sm" className="rounded-xl border-slate-200 bg-white" onClick={() => openEditFormatDialog(format)}>
                                        <PencilLine className="h-4 w-4" />
                                        Edit
                                      </Button>
                                      <Button type="button" variant="outline" size="sm" className="rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800" onClick={() => setFormatToDelete(format)}>
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </DataTableShell>
                    </TabsContent>

                    <TabsContent value="types">
                      <DataTableShell
                        title="Poster Types"
                        subtitle="Manage the poster categories and names used for prompt generation."
                        count={posterTypes.length}
                        action={
                          <Button
                            type="button"
                            onClick={openCreatePosterTypeDialog}
                            className="rounded-2xl bg-slate-950 px-4 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-800"
                          >
                            <Plus className="h-4 w-4" />
                            Add Type
                          </Button>
                        }
                      >
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-200/80 hover:bg-transparent">
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Category</TableHead>
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Poster Type</TableHead>
                              <TableHead className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {posterTypes.length === 0 ? (
                              <EmptyTableState
                                colSpan={3}
                                title="No poster types yet"
                                description="Create poster types to organize generator use cases by category."
                              />
                            ) : (
                              posterTypes.map((item) => (
                                <TableRow key={item.id} className="border-slate-100/90 hover:bg-slate-50/80">
                                  <TableCell className="px-4 py-4">
                                    <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
                                      {item.category}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="px-4 py-4 font-medium text-slate-950">{item.name}</TableCell>
                                  <TableCell className="px-4 py-4">
                                    <div className="flex justify-end gap-2">
                                      <Button type="button" variant="outline" size="sm" className="rounded-xl border-slate-200 bg-white" onClick={() => openEditPosterTypeDialog(item)}>
                                        <PencilLine className="h-4 w-4" />
                                        Edit
                                      </Button>
                                      <Button type="button" variant="outline" size="sm" className="rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800" onClick={() => setPosterTypeToDelete(item)}>
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </DataTableShell>
                    </TabsContent>

                    <TabsContent value="styles">
                      <DataTableShell
                        title="Design Styles"
                        subtitle="Keep traits visible at a glance while editing full detail in a focused modal."
                        count={designStyles.length}
                        action={
                          <Button
                            type="button"
                            onClick={openCreateDesignStyleDialog}
                            className="rounded-2xl bg-slate-950 px-4 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-800"
                          >
                            <Plus className="h-4 w-4" />
                            Add Style
                          </Button>
                        }
                      >
                        <Table>
                          <TableHeader>
                            <TableRow className="border-slate-200/80 hover:bg-transparent">
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Style Name</TableHead>
                              <TableHead className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Traits</TableHead>
                              <TableHead className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {designStyles.length === 0 ? (
                              <EmptyTableState
                                colSpan={3}
                                title="No design styles yet"
                                description="Add a style to define the tone and visual traits available to the generator."
                              />
                            ) : (
                              designStyles.map((item) => {
                                const traits = parseTraits(item.traitsText)
                                return (
                                  <TableRow key={item.id} className="border-slate-100/90 hover:bg-slate-50/80">
                                    <TableCell className="px-4 py-4 font-medium text-slate-950">{item.name}</TableCell>
                                    <TableCell className="px-4 py-4 whitespace-normal">
                                      <div className="flex flex-wrap gap-2">
                                        {traits.slice(0, 4).map((trait) => (
                                          <Badge key={trait} variant="outline" className="rounded-full border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
                                            {trait}
                                          </Badge>
                                        ))}
                                        {traits.length > 4 ? (
                                          <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
                                            +{traits.length - 4} more
                                          </Badge>
                                        ) : null}
                                      </div>
                                    </TableCell>
                                    <TableCell className="px-4 py-4">
                                      <div className="flex justify-end gap-2">
                                        <Button type="button" variant="outline" size="sm" className="rounded-xl border-slate-200 bg-white" onClick={() => openEditDesignStyleDialog(item)}>
                                          <PencilLine className="h-4 w-4" />
                                          Edit
                                        </Button>
                                        <Button type="button" variant="outline" size="sm" className="rounded-xl border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800" onClick={() => setDesignStyleToDelete(item)}>
                                          <Trash2 className="h-4 w-4" />
                                          Delete
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            )}
                          </TableBody>
                        </Table>
                      </DataTableShell>
                    </TabsContent>
                  </Tabs>
                </div>

                <aside className="space-y-4">
                  <section className="rounded-[28px] border border-white/60 bg-white/90 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.32)] backdrop-blur">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Quick Stats</h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><dt className="text-slate-500">Format rows</dt><dd className="font-semibold text-slate-950">{formats.length}</dd></div>
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><dt className="text-slate-500">Poster type rows</dt><dd className="font-semibold text-slate-950">{posterTypes.length}</dd></div>
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"><dt className="text-slate-500">Design style rows</dt><dd className="font-semibold text-slate-950">{designStyles.length}</dd></div>
                    </dl>
                  </section>

                  <section className="rounded-[28px] border border-white/60 bg-white/90 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.32)] backdrop-blur">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Format Categories</h2>
                    <div className="mt-4 space-y-2 text-sm">
                      {Object.entries(formatCategoryCounts).length ? (
                        Object.entries(formatCategoryCounts).map(([category, count]) => (
                          <div key={category} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                            <span className="text-slate-600">{category}</span>
                            <span className="font-semibold text-slate-950">{count}</span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-slate-50 px-4 py-5 text-slate-500">No format categories yet.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-white/60 bg-white/90 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.32)] backdrop-blur">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Poster Type Categories</h2>
                    <div className="mt-4 space-y-2 text-sm">
                      {Object.entries(posterTypeCategoryCounts).length ? (
                        Object.entries(posterTypeCategoryCounts).map(([category, count]) => (
                          <div key={category} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                            <span className="text-slate-600">{category}</span>
                            <span className="font-semibold text-slate-950">{count}</span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-slate-50 px-4 py-5 text-slate-500">No poster type categories yet.</p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-white/60 bg-white/90 p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.32)] backdrop-blur">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Style Trait Counts</h2>
                    <div className="mt-4 space-y-2 text-sm">
                      {Object.entries(designStyleTraitCounts).length ? (
                        Object.entries(designStyleTraitCounts).map(([name, count]) => (
                          <div key={name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                            <span className="text-slate-600">{name}</span>
                            <span className="font-semibold text-slate-950">{count}</span>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl bg-slate-50 px-4 py-5 text-slate-500">No style traits to summarize yet.</p>
                      )}
                    </div>
                  </section>
                </aside>
              </section>
            </>
          ) : null}
        </div>
      </main>

      <Dialog open={formatDialogOpen} onOpenChange={setFormatDialogOpen}>
        <DialogContent className="rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.45)] sm:max-w-xl">
          <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#eef2ff)] px-6 py-5">
            <DialogTitle>{formatDialogMode === 'edit' ? 'Edit Format' : 'Add Format'}</DialogTitle>
            <DialogDescription>Update the format metadata shown in the table and used by the generator.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Format name</label>
                <Input value={formatDraft.name} onChange={(e) => { setFormatDraft((current) => ({ ...current, name: e.target.value })); setFormatDialogError('') }} placeholder="Facebook Post" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <Input value={formatDraft.category} onChange={(e) => { setFormatDraft((current) => ({ ...current, category: e.target.value })); setFormatDialogError('') }} placeholder="Social Media" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Width</label>
                <Input inputMode="numeric" value={formatDraft.width} onChange={(e) => { setFormatDraft((current) => ({ ...current, width: e.target.value })); setFormatDialogError('') }} placeholder="1080" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Height</label>
                <Input inputMode="numeric" value={formatDraft.height} onChange={(e) => { setFormatDraft((current) => ({ ...current, height: e.target.value })); setFormatDialogError('') }} placeholder="1080" />
              </div>
            </div>
            {formatDialogError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formatDialogError}</p> : null}
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-5">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFormatDialogOpen(false)}>Cancel</Button>
            <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={submitFormatDraft}>
              {formatDialogMode === 'edit' ? 'Save changes' : 'Add format'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={posterTypeDialogOpen} onOpenChange={setPosterTypeDialogOpen}>
        <DialogContent className="rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.45)] sm:max-w-xl">
          <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,#f8fafc,#ecfeff)] px-6 py-5">
            <DialogTitle>{posterTypeDialogMode === 'edit' ? 'Edit Poster Type' : 'Add Poster Type'}</DialogTitle>
            <DialogDescription>Keep category labels and poster names organized in one structured entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <Input value={posterTypeDraft.category} onChange={(e) => { setPosterTypeDraft((current) => ({ ...current, category: e.target.value })); setPosterTypeDialogError('') }} placeholder="Business" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Poster type</label>
                <Input value={posterTypeDraft.name} onChange={(e) => { setPosterTypeDraft((current) => ({ ...current, name: e.target.value })); setPosterTypeDialogError('') }} placeholder="Event Poster" />
              </div>
            </div>
            {posterTypeDialogError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{posterTypeDialogError}</p> : null}
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-5">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPosterTypeDialogOpen(false)}>Cancel</Button>
            <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={submitPosterTypeDraft}>
              {posterTypeDialogMode === 'edit' ? 'Save changes' : 'Add type'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={designStyleDialogOpen} onOpenChange={setDesignStyleDialogOpen}>
        <DialogContent className="rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_30px_80px_-34px_rgba(15,23,42,0.45)] sm:max-w-2xl">
          <DialogHeader className="border-b border-slate-200 bg-[linear-gradient(135deg,#fff7ed,#fef3c7)] px-6 py-5">
            <DialogTitle>{designStyleDialogMode === 'edit' ? 'Edit Design Style' : 'Add Design Style'}</DialogTitle>
            <DialogDescription>Each trait should be placed on its own line to keep the saved prompt data clean.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Style name</label>
              <Input value={designStyleDraft.name} onChange={(e) => { setDesignStyleDraft((current) => ({ ...current, name: e.target.value })); setDesignStyleDialogError('') }} placeholder="Minimalist" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Traits</label>
              <textarea
                className="min-h-40 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-xs outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-200/70"
                value={designStyleDraft.traitsText}
                onChange={(e) => { setDesignStyleDraft((current) => ({ ...current, traitsText: e.target.value })); setDesignStyleDialogError('') }}
                placeholder={'Clean\nWhite space\nModern typography'}
              />
            </div>
            {designStyleDialogError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{designStyleDialogError}</p> : null}
          </div>
          <DialogFooter className="border-t border-slate-200 px-6 py-5">
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setDesignStyleDialogOpen(false)}>Cancel</Button>
            <Button type="button" className="rounded-xl bg-slate-950 text-white hover:bg-slate-800" onClick={submitDesignStyleDraft}>
              {designStyleDialogMode === 'edit' ? 'Save changes' : 'Add style'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!formatToDelete} onOpenChange={(open) => { if (!open) setFormatToDelete(null) }}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete format?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatToDelete ? `This will remove ${formatToDelete.name} from the current settings draft.` : 'This action removes the selected format.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!formatToDelete) return
                setFormats((current) => current.filter((item) => item.id !== formatToDelete.id))
                setNotice('')
                setError('')
                setFormatToDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!posterTypeToDelete} onOpenChange={(open) => { if (!open) setPosterTypeToDelete(null) }}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete poster type?</AlertDialogTitle>
            <AlertDialogDescription>
              {posterTypeToDelete ? `This will remove ${posterTypeToDelete.name} from the current settings draft.` : 'This action removes the selected poster type.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!posterTypeToDelete) return
                setPosterTypes((current) => current.filter((item) => item.id !== posterTypeToDelete.id))
                setNotice('')
                setError('')
                setPosterTypeToDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!designStyleToDelete} onOpenChange={(open) => { if (!open) setDesignStyleToDelete(null) }}>
        <AlertDialogContent className="rounded-[28px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete design style?</AlertDialogTitle>
            <AlertDialogDescription>
              {designStyleToDelete ? `This will remove ${designStyleToDelete.name} from the current settings draft.` : 'This action removes the selected design style.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (!designStyleToDelete) return
                setDesignStyles((current) => current.filter((item) => item.id !== designStyleToDelete.id))
                setNotice('')
                setError('')
                setDesignStyleToDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
