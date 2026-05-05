import { notFound } from 'next/navigation'

import { createSupabaseAdminClient } from '@/lib/server/albums'
import PublicFormClient, { type PublicFormData } from './public-form-client'

type FormPageProps = {
  params: Promise<{ slug: string }>
}

export default async function PublicFormPage({ params }: FormPageProps) {
  const { slug } = await params
  const supabaseAdmin = createSupabaseAdminClient()

  const { data: questionnaire, error: questionnaireError } = await supabaseAdmin
    .from('albums_questionnaires')
    .select('id, name, description, logo_url, is_published, is_accepting_responses, collect_email')
    .eq('slug', slug)
    .maybeSingle()

  if (questionnaireError) {
    throw new Error(questionnaireError.message)
  }

  if (!questionnaire || !questionnaire.is_published) {
    notFound()
  }

  const [{ data: groups, error: groupsError }, { data: questions, error: questionsError }] = await Promise.all([
    supabaseAdmin
      .from('albums_question_groups')
      .select('id, title, description, position')
      .eq('questionnaire_id', questionnaire.id)
      .order('position', { ascending: true }),
    supabaseAdmin
      .from('albums_questions')
      .select('id, group_id, label, description, type, required, position')
      .eq('questionnaire_id', questionnaire.id)
      .order('position', { ascending: true }),
  ])

  if (groupsError) {
    throw new Error(groupsError.message)
  }

  if (questionsError) {
    throw new Error(questionsError.message)
  }

  const questionIds = (questions ?? []).map((question) => question.id)
  const { data: options, error: optionsError } = questionIds.length
    ? await supabaseAdmin
        .from('albums_question_options')
        .select('id, question_id, label, value, position')
        .in('question_id', questionIds)
        .order('position', { ascending: true })
    : { data: [], error: null }

  if (optionsError) {
    throw new Error(optionsError.message)
  }

  const formData: PublicFormData = {
    slug,
    id: questionnaire.id,
    name: questionnaire.name,
    description: questionnaire.description,
    logoUrl: questionnaire.logo_url,
    isAcceptingResponses: questionnaire.is_accepting_responses,
    collectEmail: questionnaire.collect_email,
    groups: groups ?? [],
    questions: (questions ?? []).map((question) => ({
      ...question,
      options: (options ?? []).filter((option) => option.question_id === question.id),
    })),
  }

  return <PublicFormClient form={formData} />
}
