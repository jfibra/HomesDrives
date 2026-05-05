import { notFound } from 'next/navigation'

import { createSupabaseAdminClient } from '@/lib/server/albums'

type ResponsesPageProps = {
  params: Promise<{ slug: string }>
}

function formatAnswer(answer: unknown) {
  if (answer == null) {
    return 'No answer'
  }

  if (typeof answer === 'string') {
    return answer || 'No answer'
  }

  if (typeof answer === 'number' || typeof answer === 'boolean') {
    return String(answer)
  }

  if (Array.isArray(answer)) {
    if (answer.length === 0) {
      return 'No answer'
    }

    // Handle uploader answers stored as file metadata objects.
    if (answer.every((item) => item && typeof item === 'object' && 'url' in item)) {
      return `${answer.length} uploaded file(s)`
    }

    return answer.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(', ')
  }

  return JSON.stringify(answer)
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

  const [{ data: questions, error: questionsError }, { data: responses, error: responsesError }] = await Promise.all([
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

  const responseIds = (responses ?? []).map((response) => response.id)
  const { data: answers, error: answersError } = responseIds.length
    ? await supabaseAdmin
        .from('albums_question_answers')
        .select('id, response_id, question_id, answer, created_at')
        .in('response_id', responseIds)
    : { data: [], error: null }

  if (answersError) {
    throw new Error(answersError.message)
  }

  const questionLabelById = new Map((questions ?? []).map((question) => [question.id, question.label]))
  const answersByResponseIdInitial = new Map<
    string,
    Array<{ questionLabel: string; answer: unknown }>
  >()
  const answersByResponseId = (answers ?? []).reduce((acc, row) => {
    const list = acc.get(row.response_id) ?? []
    list.push({
      questionLabel: questionLabelById.get(row.question_id) ?? 'Unknown question',
      answer: row.answer,
    })
    acc.set(row.response_id, list)
    return acc
  }, answersByResponseIdInitial)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Questionnaire Responses</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{questionnaire.name}</h1>
              {questionnaire.description && (
                <p className="mt-2 max-w-3xl text-sm text-slate-600">{questionnaire.description}</p>
              )}
            </div>

            <div className="text-right text-xs text-slate-500">
              <p>Total responses: {(responses ?? []).length}</p>
              <p>Status: {questionnaire.is_accepting_responses ? 'Accepting responses' : 'Closed'}</p>
              <p>Visibility: {questionnaire.is_published ? 'Published' : 'Draft'}</p>
            </div>
          </div>
        </header>

        {(responses ?? []).length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            No responses yet.
          </section>
        ) : (
          <section className="space-y-4">
            {(responses ?? []).map((response, responseIndex) => {
              const responseAnswers = answersByResponseId.get(response.id) ?? []

              return (
                <article key={response.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-base font-semibold">Response #{(responses ?? []).length - responseIndex}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>Status: {response.status}</span>
                      {response.respondent_email && <span>Email: {response.respondent_email}</span>}
                      <span>
                        Submitted:{' '}
                        {new Date(response.submitted_at || response.created_at).toLocaleString('en-PH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    {responseAnswers.length === 0 ? (
                      <p className="text-sm text-slate-500">No answers captured.</p>
                    ) : (
                      responseAnswers.map((item, index) => (
                        <div key={`${response.id}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="text-sm font-medium text-slate-800">{item.questionLabel}</p>
                          <p className="mt-1 break-words text-sm text-slate-600">{formatAnswer(item.answer)}</p>
                          {Array.isArray(item.answer) &&
                            item.answer.every((entry) => entry && typeof entry === 'object' && 'url' in entry) && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {item.answer.map((entry, fileIndex) => {
                                  const typedEntry = entry as { url?: string; fileName?: string }
                                  if (!typedEntry.url) return null

                                  return (
                                    <a
                                      key={`${response.id}-${index}-file-${fileIndex}`}
                                      href={typedEntry.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                                    >
                                      {typedEntry.fileName || `File ${fileIndex + 1}`}
                                    </a>
                                  )
                                })}
                              </div>
                            )}
                        </div>
                      ))
                    )}
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
