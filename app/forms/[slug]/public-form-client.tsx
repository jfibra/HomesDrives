'use client'

import { useMemo, useState } from 'react'

type FormGroup = {
  id: string
  title: string
  description: string | null
  position: number
}

type FormOption = {
  id: string
  question_id: string
  label: string
  value: string
  position: number
}

type FormQuestion = {
  id: string
  group_id: string | null
  label: string
  description: string | null
  type: string
  required: boolean
  position: number
  options: FormOption[]
}

export type PublicFormData = {
  slug: string
  id: string
  name: string
  description: string | null
  logoUrl: string | null
  isAcceptingResponses: boolean
  collectEmail: boolean
  groups: FormGroup[]
  questions: FormQuestion[]
}

type SubmitState = 'idle' | 'submitting' | 'submitted' | 'error'

function valueIsEmpty(value: unknown) {
  if (value == null) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return value.length === 0
  return false
}

export default function PublicFormClient({ form }: { form: PublicFormData }) {
  const [respondentEmail, setRespondentEmail] = useState('')
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [fileAnswers, setFileAnswers] = useState<Record<string, File[]>>({})
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [message, setMessage] = useState('')

  const grouped = useMemo(() => {
    const groups = form.groups.map((group) => ({
      ...group,
      questions: form.questions.filter((question) => question.group_id === group.id),
    }))

    const ungroupedQuestions = form.questions.filter((question) => !question.group_id)
    if (ungroupedQuestions.length > 0) {
      groups.unshift({
        id: 'ungrouped',
        title: 'Questions',
        description: null,
        position: -1,
        questions: ungroupedQuestions,
      })
    }

    return groups
  }, [form.groups, form.questions])

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  async function uploadFiles(questionLabel: string, files: File[]) {
    const uploaded: Array<{ bucket: string; path: string; url: string; fileName: string }> = []

    for (const file of files) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kind', 'answer')
      formData.append('questionnaireName', form.name)
      formData.append('questionLabel', questionLabel)

      const response = await fetch('/api/questionnaires/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload a file answer.')
      }

      uploaded.push({
        bucket: data.file.bucket,
        path: data.file.path,
        url: data.file.url,
        fileName: file.name,
      })
    }

    return uploaded
  }

  async function submitForm() {
    if (!form.isAcceptingResponses) {
      setSubmitState('error')
      setMessage('This form is not accepting responses.')
      return
    }

    if (form.collectEmail && !respondentEmail.trim()) {
      setSubmitState('error')
      setMessage('Email is required for this form.')
      return
    }

    setSubmitState('submitting')
    setMessage('Submitting response...')

    try {
      const payloadAnswers: Array<{ questionId: string; answer: unknown }> = []

      for (const question of form.questions) {
        if (question.type === 'file_upload') {
          const files = fileAnswers[question.id] ?? []

          if (question.required && files.length === 0) {
            throw new Error(`Required upload is missing: ${question.label}`)
          }

          if (files.length > 0) {
            const uploadedFiles = await uploadFiles(question.label, files)
            payloadAnswers.push({
              questionId: question.id,
              answer: uploadedFiles,
            })
          }

          continue
        }

        const value = answers[question.id]

        if (question.required && valueIsEmpty(value)) {
          throw new Error(`Required answer is missing: ${question.label}`)
        }

        if (!valueIsEmpty(value)) {
          payloadAnswers.push({ questionId: question.id, answer: value })
        }
      }

      const response = await fetch(`/api/questionnaires/${form.slug}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          respondentEmail: respondentEmail.trim() || null,
          answers: payloadAnswers,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Unable to submit response.')
      }

      setSubmitState('submitted')
      setMessage('Response submitted. Thank you!')
      setAnswers({})
      setFileAnswers({})
      setRespondentEmail('')
    } catch (error) {
      setSubmitState('error')
      setMessage(error instanceof Error ? error.message : 'Unable to submit form response.')
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 md:px-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {form.logoUrl && (
            <img src={form.logoUrl} alt="Questionnaire logo" className="mb-4 h-14 w-auto object-contain" />
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{form.name}</h1>
          {form.description && <p className="mt-2 text-sm text-slate-600">{form.description}</p>}
          {!form.isAcceptingResponses && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              This form is currently not accepting responses.
            </p>
          )}
        </header>

        {form.collectEmail && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Email</span>
              <input
                type="email"
                value={respondentEmail}
                onChange={(event) => setRespondentEmail(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                placeholder="you@example.com"
              />
            </label>
          </section>
        )}

        {grouped.map((group) => (
          <section key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            {group.description && <p className="mt-1 text-sm text-slate-600">{group.description}</p>}

            <div className="mt-4 space-y-4">
              {group.questions.map((question) => (
                <div key={question.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-medium">
                    {question.label}
                    {question.required ? ' *' : ''}
                  </p>
                  {question.description && <p className="mt-1 text-xs text-slate-600">{question.description}</p>}

                  <div className="mt-3">
                    {(question.type === 'short_text' || question.type === 'email' || question.type === 'phone' || question.type === 'url') && (
                      <input
                        type={question.type === 'short_text' ? 'text' : question.type}
                        value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                    )}

                    {question.type === 'number' && (
                      <input
                        type="number"
                        value={typeof answers[question.id] === 'number' ? String(answers[question.id]) : ''}
                        onChange={(event) => setAnswer(question.id, event.target.value === '' ? null : Number(event.target.value))}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                    )}

                    {(question.type === 'date' || question.type === 'time' || question.type === 'datetime') && (
                      <input
                        type={question.type === 'datetime' ? 'datetime-local' : question.type}
                        value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                    )}

                    {question.type === 'long_text' && (
                      <textarea
                        value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      />
                    )}

                    {question.type === 'dropdown' && (
                      <select
                        value={typeof answers[question.id] === 'string' ? (answers[question.id] as string) : ''}
                        onChange={(event) => setAnswer(question.id, event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                      >
                        <option value="">Select an option</option>
                        {question.options.map((option) => (
                          <option key={option.id} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    )}

                    {question.type === 'radio' && (
                      <div className="space-y-2">
                        {question.options.map((option) => (
                          <label key={option.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={question.id}
                              value={option.value}
                              checked={answers[question.id] === option.value}
                              onChange={() => setAnswer(question.id, option.value)}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    )}

                    {question.type === 'checkbox' && (
                      <div className="space-y-2">
                        {question.options.map((option) => {
                          const current = Array.isArray(answers[question.id]) ? (answers[question.id] as string[]) : []
                          const checked = current.includes(option.value)

                          return (
                            <label key={option.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                value={option.value}
                                checked={checked}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    setAnswer(question.id, [...current, option.value])
                                  } else {
                                    setAnswer(
                                      question.id,
                                      current.filter((value) => value !== option.value),
                                    )
                                  }
                                }}
                              />
                              {option.label}
                            </label>
                          )
                        })}
                      </div>
                    )}

                    {question.type === 'file_upload' && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          multiple
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? [])
                            setFileAnswers((prev) => ({ ...prev, [question.id]: files }))
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                        <p className="text-xs text-slate-500">
                          Uploads are stored under filipinohomes123/homesph/questionnaires.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-600">{message || 'Ready to submit your response.'}</p>
            <button
              type="button"
              onClick={submitForm}
              disabled={!form.isAcceptingResponses || submitState === 'submitting'}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitState === 'submitting' ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </section>
      </div>
    </main>
  )
}
