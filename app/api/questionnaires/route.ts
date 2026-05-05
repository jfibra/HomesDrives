import { NextResponse } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/server/albums'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limitParam = Number.parseInt(searchParams.get('limit') || '', 10)
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(limitParam, 1), 200)
      : 100

    const supabaseAdmin = createSupabaseAdminClient()
    const { data: questionnaires, error } = await supabaseAdmin
      .from('albums_questionnaires')
      .select(
        'id, name, slug, description, logo_url, is_published, is_accepting_responses, created_at, updated_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw new Error(error.message)
    }

    const questionnaireIds = (questionnaires ?? []).map((q) => q.id)

    let questionCounts = new Map<string, number>()
    let responseCounts = new Map<string, number>()

    if (questionnaireIds.length > 0) {
      const [{ data: questions }, { data: responses }] = await Promise.all([
        supabaseAdmin
          .from('albums_questions')
          .select('id, questionnaire_id')
          .in('questionnaire_id', questionnaireIds),
        supabaseAdmin
          .from('albums_questionnaire_responses')
          .select('id, questionnaire_id')
          .in('questionnaire_id', questionnaireIds),
      ])

      questionCounts = (questions ?? []).reduce((acc, row) => {
        acc.set(row.questionnaire_id, (acc.get(row.questionnaire_id) ?? 0) + 1)
        return acc
      }, new Map<string, number>())

      responseCounts = (responses ?? []).reduce((acc, row) => {
        acc.set(row.questionnaire_id, (acc.get(row.questionnaire_id) ?? 0) + 1)
        return acc
      }, new Map<string, number>())
    }

    const enriched = (questionnaires ?? []).map((questionnaire) => ({
      ...questionnaire,
      questions_count: questionCounts.get(questionnaire.id) ?? 0,
      responses_count: responseCounts.get(questionnaire.id) ?? 0,
    }))

    return NextResponse.json({ questionnaires: enriched })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to list questionnaires.',
      },
      { status: 500 },
    )
  }
}

type CreatePayload = {
  name?: string
  description?: string | null
  logoUrl?: string | null
  isPublished?: boolean
  groups?: Array<{
    clientId: string
    title: string
    description?: string | null
    position: number
  }>
  questions?: Array<{
    clientId: string
    groupClientId: string
    label: string
    description?: string | null
    type: string
    required: boolean
    position: number
    options?: Array<{
      label: string
      value: string
      position: number
    }>
  }>
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeQuestionKey(label: string, index: number) {
  const base = slugify(label) || `question-${index + 1}`

  return `${base}-${index + 1}`
}

async function ensureUniqueQuestionnaireSlug(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  preferredName: string,
) {
  const base = slugify(preferredName) || `questionnaire-${Date.now()}`
  let candidate = base
  let suffix = 1

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('albums_questionnaires')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      return candidate
    }

    suffix += 1
    candidate = `${base}-${suffix}`
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePayload

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : null
    const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl.trim() : null
    const isPublished = body.isPublished === true
    const groups = Array.isArray(body.groups) ? body.groups : []
    const questions = Array.isArray(body.questions) ? body.questions : []

    if (!name) {
      return NextResponse.json({ error: 'Missing questionnaire name.' }, { status: 400 })
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: 'At least one question is required.' }, { status: 400 })
    }

    const supabaseAdmin = createSupabaseAdminClient()

    const uniqueSlug = await ensureUniqueQuestionnaireSlug(supabaseAdmin, name)

    const { data: questionnaire, error: questionnaireError } = await supabaseAdmin
      .from('albums_questionnaires')
      .insert({
        name,
        slug: uniqueSlug,
        description,
        logo_url: logoUrl,
        is_published: isPublished,
      })
      .select('id, name, slug, is_published, created_at')
      .single()

    if (questionnaireError || !questionnaire) {
      throw new Error(questionnaireError?.message || 'Unable to create questionnaire.')
    }

    const groupRows = groups.map((group) => ({
      questionnaire_id: questionnaire.id,
      title: group.title,
      description: group.description || null,
      position: group.position,
    }))

    const { data: insertedGroups, error: groupsError } = groupRows.length
      ? await supabaseAdmin
          .from('albums_question_groups')
          .insert(groupRows)
          .select('id, title, position')
      : { data: [], error: null }

    if (groupsError) {
      throw new Error(groupsError.message)
    }

    const groupIdByClientId = new Map<string, string>()
    groups.forEach((group) => {
      const match = insertedGroups?.find((inserted) => inserted.title === group.title && inserted.position === group.position)
      if (match) {
        groupIdByClientId.set(group.clientId, match.id)
      }
    })

    const questionRows = questions.map((question, index) => ({
      questionnaire_id: questionnaire.id,
      group_id: groupIdByClientId.get(question.groupClientId) || null,
      question_key: normalizeQuestionKey(question.label, index),
      label: question.label,
      description: question.description || null,
      type: question.type,
      required: question.required,
      position: question.position,
      validation:
        question.type === 'file_upload'
          ? {
              accept: ['image/*', 'application/pdf'],
              maxFiles: 20,
              targetPath: 'filipinohomes123/homesph',
            }
          : {},
    }))

    const { data: insertedQuestions, error: questionsError } = await supabaseAdmin
      .from('albums_questions')
      .insert(questionRows)
      .select('id, label, position')

    if (questionsError || !insertedQuestions) {
      throw new Error(questionsError?.message || 'Unable to create questions.')
    }

    const optionRows: Array<{
      question_id: string
      label: string
      value: string
      position: number
    }> = []

    questions.forEach((question) => {
      const insertedQuestion = insertedQuestions.find(
        (value) => value.label === question.label && value.position === question.position,
      )
      if (!insertedQuestion || !Array.isArray(question.options)) {
        return
      }

      question.options.forEach((option) => {
        optionRows.push({
          question_id: insertedQuestion.id,
          label: option.label,
          value: option.value,
          position: option.position,
        })
      })
    })

    if (optionRows.length > 0) {
      const { error: optionsError } = await supabaseAdmin
        .from('albums_question_options')
        .insert(optionRows)

      if (optionsError) {
        throw new Error(optionsError.message)
      }
    }

    const publicUrl = `${new URL(request.url).origin}/forms/${questionnaire.slug}`

    return NextResponse.json({
      questionnaire,
      publicUrl,
      counts: {
        groups: insertedGroups?.length ?? 0,
        questions: insertedQuestions.length,
        options: optionRows.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to create questionnaire.',
      },
      { status: 500 },
    )
  }
}
