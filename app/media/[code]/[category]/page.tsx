import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CalendarDays, GraduationCap, Hotel, Newspaper, UtensilsCrossed } from 'lucide-react'

import { getUserByCode } from '@/lib/server/albums'

type PageProps = {
  params: Promise<{ code: string; category: string }>
}

const CATEGORY_DETAILS = {
  event: {
    description: 'Browse public event content from this media profile.',
    icon: CalendarDays,
    label: 'Event',
  },
  hotels: {
    description: 'Browse public hotel content from this media profile.',
    icon: Hotel,
    label: 'Hotels',
  },
  news: {
    description: 'Browse public news content from this media profile.',
    icon: Newspaper,
    label: 'News',
  },
  restaurants: {
    description: 'Browse public restaurant content from this media profile.',
    icon: UtensilsCrossed,
    label: 'Restaurant',
  },
  schools: {
    description: 'Browse public school content from this media profile.',
    icon: GraduationCap,
    label: 'Schools',
  },
} as const

export default async function MediaCategoryPage({ params }: PageProps) {
  const { category, code } = await params
  const user = await getUserByCode(code).catch(() => null)
  const details = CATEGORY_DETAILS[category as keyof typeof CATEGORY_DETAILS]

  if (!user || user.status !== 'active' || user.role !== 'media' || !details) {
    notFound()
  }

  const Icon = details.icon

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f0e8_0%,#fcfbf7_36%,#eef3f8_100%)] px-5 py-8 text-slate-900 sm:px-8 sm:py-10 lg:py-14">
      <section className="mx-auto max-w-4xl">
        <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="bg-[radial-gradient(circle_at_top_left,#dfeaf6_0,#f6efe5_38%,#ffffff_72%)] p-6 sm:p-8 lg:p-10">
            <Link
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              href={`/media/${encodeURIComponent(user.code)}`}
            >
              Back to profile
            </Link>

            <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Media Category
                </p>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                  {details.label}
                </h1>
                <p className="max-w-2xl text-base text-slate-600">{details.description}</p>
                <p className="text-sm text-slate-500">
                  Public profile: <span className="font-semibold text-slate-800">{user.full_name}</span>
                </p>
              </div>

              <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#08243d] text-white shadow-[0_18px_50px_rgba(10,37,64,0.18)]">
                <Icon className="h-10 w-10" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
