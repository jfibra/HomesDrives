import Link from 'next/link'
import { Check, UserRound } from 'lucide-react'

import type { Person } from '@/lib/types/people'

type PersonCardProps = {
  onToggle?: () => void
  person: Person
  personBasePath?: string
  selected?: boolean
  selectMode?: boolean
}

export default function PersonCard({
  onToggle,
  person,
  personBasePath = '/people',
  selected = false,
  selectMode = false,
}: PersonCardProps) {
  const cardBody = (
    <>
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        {selectMode ? (
          <div
            className={`absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded-md border shadow-sm ${
              selected
                ? 'border-[#10233f] bg-[#10233f] text-white'
                : 'border-slate-300 bg-white/95 text-transparent'
            }`}
          >
            <Check className="h-3 w-3" />
          </div>
        ) : null}
        {person.cover_face_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={person.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            src={person.cover_face_url}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <UserRound className="h-16 w-16" />
          </div>
        )}
      </div>
      <div className="space-y-1 p-4">
        <p className="truncate text-sm font-semibold text-[#10233f]">{person.name}</p>
        <p className="text-xs text-slate-500">
          {person.photo_count} photo{person.photo_count === 1 ? '' : 's'}
        </p>
      </div>
    </>
  )

  if (selectMode) {
    return (
      <button
        className={`group w-full overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
          selected ? 'border-[#10233f] ring-2 ring-[#10233f]/15' : 'border-slate-200/80'
        }`}
        onClick={onToggle}
        type="button"
      >
        {cardBody}
      </button>
    )
  }

  return (
    <Link
      className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      href={`${personBasePath}/${person.id}`}
    >
      {cardBody}
    </Link>
  )
}
