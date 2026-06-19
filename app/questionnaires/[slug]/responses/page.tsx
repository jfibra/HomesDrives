import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { createSupabaseAdminClient } from '@/lib/server/albums'

type ResponsesPageProps = {
  params: Promise<{ slug: string }>
}

type FileAnswerEntry = {
  url?: string
  fileName?: string
}

function isFileAnswerEntry(value: unknown): value is FileAnswerEntry {
  return Boolean(value && typeof value === 'object' && 'url' in value)
}

function isFileAnswerList(answer: unknown): answer is FileAnswerEntry[] {
  return Array.isArray(answer) && answer.length > 0 && answer.every(isFileAnswerEntry)
}

function isValueWrapper(value: unknown): value is { value: unknown; label?: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isFileAnswerEntry(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  if (!('value' in record)) {
    return false
  }

  return Object.keys(record).every((key) => key === 'value' || key === 'label')
}

function unwrapStoredAnswer(answer: unknown): unknown {
  if (isValueWrapper(answer)) {
    if (typeof answer.label === 'string' && answer.label.trim()) {
      return answer.label.trim()
    }

    return unwrapStoredAnswer(answer.value)
  }

  if (Array.isArray(answer)) {
    return answer.map(unwrapStoredAnswer)
  }

  return answer
}

function formatAnswerText(answer: unknown) {
  const normalized = unwrapStoredAnswer(answer)

  if (normalized == null) {
    return '—'
  }

  if (typeof normalized === 'string') {
    return normalized.trim() || '—'
  }

  if (typeof normalized === 'number' || typeof normalized === 'boolean') {
    return String(normalized)
  }

  if (Array.isArray(normalized)) {
    if (normalized.length === 0) {
      return '—'
    }

    if (isFileAnswerList(normalized)) {
      return `${normalized.length} file${normalized.length === 1 ? '' : 's'}`
    }

    return normalized
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(', ')
  }

  return JSON.stringify(normalized)
}

function AnswerCell({ answer }: { answer: unknown }) {
  if (isFileAnswerList(answer)) {
    return (
      <div className="flex flex-col gap-1.5">
        {answer.map((entry, index) =>
          entry.url ? (
            <a
              key={`${entry.url}-${index}`}
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit max-w-full truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {entry.fileName || `File ${index + 1}`}
            </a>
          ) : null,
        )}
      </div>
    )
  }

  return <span className="whitespace-pre-wrap break-words text-slate-700">{formatAnswerText(answer)}</span>
}

export default async function QuestionnaireResponsesPage({ params }: ResponsesPageProps) {
  const { slug } = await params
  const supabaseAdmin = createSupabaseAdminClient()

  const { data: questionnaire, error: questionnaireError } = await supabaseAdmin
    .from('albums_questionnaires')
    .select('id, name, slug, description, is_published, is_accepting_responses, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (questionnaireError) {
    throw new Error(questionnaireError.message)
  }

  if (!questionnaire) {
    notFound()
  }

  const [{ data: questions, error: questionsError }, { data: responses, error: responsesError }] =
    await Promise.all([
      supabaseAdmin
        .from('albums_questions')
        .select('id, label, position')
        .eq('questionnaire_id', questionnaire.id)
        .order('position', { ascending: true }),
      supabaseAdmin
        .from('albums_questionnaire_responses')
        .select('id, respondent_email, status, started_at, submitted_at, created_at')
        .eq('questionnaire_id', questionnaire.id)
        .order('created_at', { ascending: false }),
    ])

  if (questionsError) {
    throw new Error(questionsError.message)
  }

  if (responsesError) {
    throw new Error(responsesError.message)
  }

  const orderedQuestions = questions ?? []
  const responseRows = responses ?? []
  const responseIds = responseRows.map((response) => response.id)

  const { data: answers, error: answersError } = responseIds.length
    ? await supabaseAdmin
        .from('albums_question_answers')
        .select('id, response_id, question_id, answer, created_at')
        .in('response_id', responseIds)
    : { data: [], error: null }

  if (answersError) {
    throw new Error(answersError.message)
  }

  const answersByResponseQuestion = new Map<string, Map<string, unknown>>()
  for (const row of answers ?? []) {
    const byQuestion = answersByResponseQuestion.get(row.response_id) ?? new Map<string, unknown>()
    byQuestion.set(row.question_id, row.answer)
    answersByResponseQuestion.set(row.response_id, byQuestion)
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-10">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <Link
            href="/questionnaires"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to questionnaires
          </Link>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Questionnaire responses
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{questionnaire.name}</h1>
              {questionnaire.description ? (
                <p className="mt-2 max-w-3xl text-sm text-slate-600">{questionnaire.description}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Responses
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {responseRows.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Questions
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {orderedQuestions.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 col-span-2 sm:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-900">
                  {questionnaire.is_accepting_responses ? 'Open' : 'Closed'}
                </p>
              </div>
            </div>
          </div>
        </header>

        {responseRows.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-sm">
            No responses yet.
          </section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3 sm:px-6">
              <h2 className="text-sm font-semibold text-slate-900">All responses</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Scroll horizontally to view every question. Newest responses appear first.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100/90 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <th className="sticky left-0 z-20 min-w-[52px] border-r border-slate-200 bg-slate-100 px-3 py-3">
                      #
                    </th>
                    <th className="min-w-[160px] whitespace-nowrap px-3 py-3">Submitted</th>
                    <th className="min-w-[180px] px-3 py-3">Email</th>
                    <th className="min-w-[100px] px-3 py-3">Status</th>
                    {orderedQuestions.map((question) => (
                      <th
                        key={question.id}
                        className="min-w-[220px] max-w-[320px] px-3 py-3 align-bottom"
                        title={question.label}
                      >
                        <span className="line-clamp-3 font-semibold normal-case tracking-normal text-slate-700">
                          {question.label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {responseRows.map((response, responseIndex) => {
                    const responseAnswers = answersByResponseQuestion.get(response.id) ?? new Map()
                    const submittedLabel = new Date(
                      response.submitted_at || response.created_at,
                    ).toLocaleString('en-PH', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })

                    return (
                      <tr
                        key={response.id}
                        className="border-b border-slate-100 align-top transition-colors hover:bg-slate-50/80"
                      >
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-3 text-xs font-semibold tabular-nums text-slate-500">
                          {responseRows.length - responseIndex}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">
                          {submittedLabel}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-700">
                          {response.respondent_email || '—'}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              response.status === 'submitted'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {response.status}
                          </span>
                        </td>
                        {orderedQuestions.map((question) => (
                          <td key={`${response.id}-${question.id}`} className="px-3 py-3 text-xs">
                            <AnswerCell answer={responseAnswers.get(question.id)} />
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
