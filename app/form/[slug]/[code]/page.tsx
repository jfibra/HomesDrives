import { redirect } from 'next/navigation'

type LegacyFormPageProps = {
  params: Promise<{ slug: string; code: string }>
}

export default async function LegacyFormPage({ params }: LegacyFormPageProps) {
  const { slug, code } = await params
  const search = new URLSearchParams({ code })

  redirect(`/forms/${encodeURIComponent(slug)}?${search.toString()}`)
}
