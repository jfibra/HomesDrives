import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/server/albums'

export const runtime = 'nodejs'

type SubmitPayload = {
  respondentEmail?: string | null
  answers?: Array<{
    questionId: string
    answer: unknown
  }>
}

function hasValue(value: unknown) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params
    const body = (await request.json()) as SubmitPayload
    const respondentEmail =
      typeof body.respondentEmail === 'string' && body.respondentEmail.trim()
        ? body.respondentEmail.trim()
        : null
    const answers = Array.isArray(body.answers) ? body.answers : []

    const supabaseAdmin = createSupabaseAdminClient()

    const { data: questionnaire, error: questionnaireError } = await supabaseAdmin
      .from('albums_questionnaires')
      .select('id, collect_email, is_published, is_accepting_responses')
      .eq('slug', slug)
      .maybeSingle()

    if (questionnaireError) {
      throw new Error(questionnaireError.message)
    }

    if (!questionnaire || !questionnaire.is_published) {
      return NextResponse.json({ error: 'Form not found.' }, { status: 404 })
    }

    if (!questionnaire.is_accepting_responses) {
      return NextResponse.json({ error: 'This form is not accepting responses.' }, { status: 403 })
    }

    if (questionnaire.collect_email && !respondentEmail) {
      return NextResponse.json({ error: 'Email is required for this form.' }, { status: 400 })
    }

    const { data: questions, error: questionsError } = await supabaseAdmin
      .from('albums_questions')
      .select('id, required')
      .eq('questionnaire_id', questionnaire.id)

    if (questionsError) {
      throw new Error(questionsError.message)
    }

    const validQuestionIds = new Set((questions ?? []).map((question) => question.id))
    const requiredQuestionIds = new Set(
      (questions ?? []).filter((question) => question.required).map((question) => question.id),
    )

    const providedQuestionIds = new Set(
      answers
        .filter((answer) => validQuestionIds.has(answer.questionId) && hasValue(answer.answer))
        .map((answer) => answer.questionId),
    )

    for (const requiredQuestionId of requiredQuestionIds) {
      if (!providedQuestionIds.has(requiredQuestionId)) {
        return NextResponse.json({ error: 'Some required answers are missing.' }, { status: 400 })
      }
    }

    const { data: responseRow, error: responseError } = await supabaseAdmin
      .from('albums_questionnaire_responses')
      .insert({
        questionnaire_id: questionnaire.id,
        respondent_email: respondentEmail,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (responseError || !responseRow) {
      throw new Error(responseError?.message || 'Unable to create response row.')
    }

    const answerRows = answers
      .filter((answer) => validQuestionIds.has(answer.questionId))
      .map((answer) => ({
        response_id: responseRow.id,
        question_id: answer.questionId,
        answer: answer.answer,
      }))

    if (answerRows.length > 0) {
      const { error: answersError } = await supabaseAdmin
        .from('albums_question_answers')
        .insert(answerRows)

      if (answersError) {
        throw new Error(answersError.message)
      }
    }

    return NextResponse.json({
      success: true,
      responseId: responseRow.id,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to submit response.',
      },
      { status: 500 },
    )
  }
}
