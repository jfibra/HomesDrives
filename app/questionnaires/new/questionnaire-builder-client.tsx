'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2, Upload, Save, GripVertical, Copy, ExternalLink } from 'lucide-react'

type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'phone'
  | 'date'
  | 'time'
  | 'datetime'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'file_upload'

type DraftOption = {
  id: string
  label: string
  value: string
}

type DraftQuestion = {
  id: string
  groupId: string
  label: string
  description: string
  type: QuestionType
  required: boolean
  options: DraftOption[]
}

type DraftGroup = {
  id: string
  title: string
  description: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'radio', label: 'Multiple choice (single)' },
  { value: 'checkbox', label: 'Checkboxes (multi)' },
  { value: 'file_upload', label: 'File uploader' },
]

const OPTION_TYPES = new Set<QuestionType>(['dropdown', 'radio', 'checkbox'])

function makeId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function QuestionnaireBuilderClient() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [isPublished, setIsPublished] = useState(false)
  const [groups, setGroups] = useState<DraftGroup[]>([
    { id: makeId('grp'), title: 'Section 1', description: '' },
  ])
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)

  const groupedQuestions = useMemo(() => {
    const map = new Map<string, DraftQuestion[]>()

    groups.forEach((group) => map.set(group.id, []))
    questions.forEach((q) => {
      const list = map.get(q.groupId)
      if (list) {
        list.push(q)
      }
    })

    return map
  }, [groups, questions])

  function addGroup() {
    setGroups((prev) => [
      ...prev,
      {
        id: makeId('grp'),
        title: `Section ${prev.length + 1}`,
        description: '',
      },
    ])
  }

  function updateGroup(id: string, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((group) => (group.id === id ? { ...group, ...patch } : group)))
  }

  function removeGroup(id: string) {
    setGroups((prev) => {
      if (prev.length === 1) {
        return prev
      }

      const next = prev.filter((group) => group.id !== id)
      const fallbackGroupId = next[0].id
      setQuestions((current) =>
        current
          .filter((q) => q.groupId !== id)
          .map((q) => (q.groupId ? q : { ...q, groupId: fallbackGroupId })),
      )
      return next
    })
  }

  function addQuestion(groupId: string) {
    setQuestions((prev) => [
      ...prev,
      {
        id: makeId('q'),
        groupId,
        label: '',
        description: '',
        type: 'short_text',
        required: false,
        options: [],
      },
    ])
  }

  function updateQuestion(id: string, patch: Partial<DraftQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)))
  }

  function removeQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id))
  }

  function addOption(questionId: string) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) {
          return q
        }

        const optionNumber = q.options.length + 1
        const label = `Option ${optionNumber}`

        return {
          ...q,
          options: [...q.options, { id: makeId('opt'), label, value: slugify(label) }],
        }
      }),
    )
  }

  function updateOption(questionId: string, optionId: string, patch: Partial<DraftOption>) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== questionId) {
          return q
        }

        return {
          ...q,
          options: q.options.map((opt) => {
            if (opt.id !== optionId) {
              return opt
            }

            const next = { ...opt, ...patch }
            if (patch.label !== undefined && patch.value === undefined) {
              next.value = slugify(patch.label)
            }
            return next
          }),
        }
      }),
    )
  }

  function removeOption(questionId: string, optionId: string) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, options: q.options.filter((o) => o.id !== optionId) } : q)),
    )
  }

  async function uploadLogo(file: File) {
    setIsUploadingLogo(true)
    setSaveMessage('Uploading logo...')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kind', 'logo')
      formData.append('questionnaireName', name || 'questionnaire')

      const response = await fetch('/api/questionnaires/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload logo.')
      }

      setLogoUrl(data.file?.url || '')
      setSaveMessage('Logo uploaded.')
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : 'Logo upload failed.')
    } finally {
      setIsUploadingLogo(false)
    }
  }

  async function saveQuestionnaire() {
    if (!name.trim()) {
      setSaveState('error')
      setSaveMessage('Questionnaire name is required.')
      return
    }

    const hasEmptyQuestion = questions.some((q) => !q.label.trim())
    if (hasEmptyQuestion) {
      setSaveState('error')
      setSaveMessage('All questions must have labels.')
      return
    }

    const invalidOptions = questions.some(
      (q) => OPTION_TYPES.has(q.type) && q.options.filter((opt) => opt.label.trim()).length < 2,
    )
    if (invalidOptions) {
      setSaveState('error')
      setSaveMessage('Dropdown/radio/checkbox questions need at least 2 options.')
      return
    }

    setSaveState('saving')
    setPublicUrl('')
    setSaveMessage('Saving questionnaire...')

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        logoUrl: logoUrl.trim() || null,
        isPublished,
        groups: groups.map((group, groupIndex) => ({
          clientId: group.id,
          title: group.title.trim() || `Section ${groupIndex + 1}`,
          description: group.description.trim() || null,
          position: groupIndex,
        })),
        questions: questions.map((q, questionIndex) => ({
          clientId: q.id,
          groupClientId: q.groupId,
          label: q.label.trim(),
          description: q.description.trim() || null,
          type: q.type,
          required: q.required,
          position: questionIndex,
          options: q.options
            .filter((option) => option.label.trim())
            .map((option, optionIndex) => ({
              label: option.label.trim(),
              value: option.value.trim() || slugify(option.label),
              position: optionIndex,
            })),
        })),
      }

      const response = await fetch('/api/questionnaires', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save questionnaire.')
      }

      setSaveState('saved')
      setSaveMessage(`Questionnaire created: ${data.questionnaire?.name || name}`)
      setPublicUrl(typeof data.publicUrl === 'string' ? data.publicUrl : '')
    } catch (error) {
      setSaveState('error')
      setSaveMessage(error instanceof Error ? error.message : 'Unable to save questionnaire.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Questionnaire Builder</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create a Dynamic Form</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Build questionnaires like Google Forms with sections, mixed question types, and uploader fields.
            Uploads are stored automatically under filipinohomes123/homesph/questionnaires.
          </p>
        </header>

        <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium">Questionnaire name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              placeholder="Property Listing Intake"
            />
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-medium">Description</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
              placeholder="Collect listing details from agents"
            />
          </label>

          <label className="space-y-2 text-sm md:col-span-2">
            <span className="font-medium">Logo URL</span>
            <div className="flex gap-2">
              <input
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-slate-500"
                placeholder="https://..."
              />
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100">
                <Upload className="h-4 w-4" />
                Upload
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void uploadLogo(file)
                    }
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </div>
          </label>

          <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span>Publish immediately</span>
          </label>
        </section>

        <section className="space-y-4">
          {groups.map((group) => {
            const sectionQuestions = groupedQuestions.get(group.id) ?? []

            return (
              <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-500">
                    <GripVertical className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Section</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeGroup(group.id)}
                    disabled={groups.length === 1}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete section
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    value={group.title}
                    onChange={(event) => updateGroup(group.id, { title: event.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    placeholder="Section title"
                  />
                  <input
                    value={group.description}
                    onChange={(event) => updateGroup(group.id, { description: event.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                    placeholder="Section description (optional)"
                  />
                </div>

                <div className="mt-4 space-y-3">
                  {sectionQuestions.map((q) => (
                    <div key={q.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="grid gap-2 md:grid-cols-2">
                        <input
                          value={q.label}
                          onChange={(event) => updateQuestion(q.id, { label: event.target.value })}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                          placeholder="Question label"
                        />
                        <select
                          value={q.type}
                          onChange={(event) => {
                            const nextType = event.target.value as QuestionType
                            updateQuestion(q.id, {
                              type: nextType,
                              options: OPTION_TYPES.has(nextType) ? q.options : [],
                            })
                          }}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                        >
                          {QUESTION_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                        <input
                          value={q.description}
                          onChange={(event) => updateQuestion(q.id, { description: event.target.value })}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 md:col-span-2"
                          placeholder="Question description/help text (optional)"
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(event) => updateQuestion(q.id, { required: event.target.checked })}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Required
                        </label>

                        <button
                          type="button"
                          onClick={() => removeQuestion(q.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>

                      {OPTION_TYPES.has(q.type) && (
                        <div className="mt-3 space-y-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
                          <p className="text-xs font-medium text-slate-600">Options</p>
                          {q.options.map((opt) => (
                            <div key={opt.id} className="flex gap-2">
                              <input
                                value={opt.label}
                                onChange={(event) =>
                                  updateOption(q.id, opt.id, { label: event.target.value })
                                }
                                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-500"
                                placeholder="Option label"
                              />
                              <button
                                type="button"
                                onClick={() => removeOption(q.id, opt.id)}
                                className="rounded-md border border-red-200 px-2 text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addOption(q.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add option
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addQuestion(group.id)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100"
                >
                  <Plus className="h-4 w-4" />
                  Add question
                </button>
              </article>
            )
          })}

          <button
            type="button"
            onClick={addGroup}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
            Add section
          </button>
        </section>

        <section className="sticky bottom-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Save Questionnaire</p>
              <p className="text-xs text-slate-600">
                {isUploadingLogo
                  ? 'Uploading logo...'
                  : saveMessage || 'When saved, this creates records in albums_questionnaires and related tables.'}
              </p>
              {publicUrl && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open public form
                  </a>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(publicUrl)
                      setSaveMessage('Public link copied.')
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </button>
                  <span className="text-slate-500">{publicUrl}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={saveQuestionnaire}
              disabled={saveState === 'saving' || isUploadingLogo}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saveState === 'saving' ? 'Saving...' : 'Save questionnaire'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
