'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Copy, Plus, Search } from 'lucide-react'

type QuestionnaireListItem = {
  id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  is_published: boolean
  is_accepting_responses: boolean
  created_at: string
  updated_at: string
  questions_count: number
  responses_count: number
}

export default function QuestionnaireListClient() {
  const [items, setItems] = useState<QuestionnaireListItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/questionnaires', { cache: 'no-store' })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load questionnaires.')
        }

        if (!cancelled) {
          setItems(Array.isArray(data.questionnaires) ? data.questionnaires : [])
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load questionnaires.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return items
    }

    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        (item.description || '').toLowerCase().includes(term) ||
        item.slug.toLowerCase().includes(term)
      )
    })
  }, [items, query])

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Questionnaires</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">All Created Questionnaires</h1>
              <p className="mt-2 text-sm text-slate-600">
                Manage your form links, review status, and open builder/public pages quickly.
              </p>
            </div>

            <a
              href="/questionnaires/new"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
              New questionnaire
            </a>
          </div>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, description, or slug"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
        </header>

        {loading && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Loading questionnaires...
          </section>
        )}

        {!loading && error && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
            {error}
          </section>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            No questionnaires found.
          </section>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <section className="grid gap-4">
            {filteredItems.map((item) => {
              const publicUrl = `/forms/${item.slug}`
              const responsesUrl = `/questionnaires/${item.slug}/responses`

              return (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">{item.name}</h2>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.is_published
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.is_published ? 'Published' : 'Draft'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            item.is_accepting_responses
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {item.is_accepting_responses ? 'Accepting responses' : 'Closed'}
                        </span>
                      </div>

                      {item.description && (
                        <p className="mt-1 text-sm text-slate-600">{item.description}</p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span>Slug: {item.slug}</span>
                        <span>Questions: {item.questions_count}</span>
                        <span>Responses: {item.responses_count}</span>
                        <span>
                          Created: {new Date(item.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <a
                        href={responsesUrl}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        View responses
                      </a>

                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open public form
                      </a>

                      <button
                        type="button"
                        onClick={async () => {
                          const fullUrl = `${window.location.origin}${publicUrl}`
                          await navigator.clipboard.writeText(fullUrl)
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy public link
                      </button>

                      <a
                        href="/questionnaires/new"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Open builder
                      </a>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        )}
      </div>
    </main>
  )
}
