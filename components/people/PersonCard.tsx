'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ImageIcon, UserRound } from 'lucide-react'

import PersonCoverPicker from '@/components/people/PersonCoverPicker'
import { buildPersonHref } from '@/lib/people-navigation'
import type { Person } from '@/lib/types/people'

type PersonCardProps = {
  enableCoverPicker?: boolean
  listPage?: number
  listQuery?: string
  onToggle?: () => void
  person: Person
  personBasePath?: string
  selected?: boolean
  selectMode?: boolean
}

export default function PersonCard({
  enableCoverPicker = true,
  listPage = 1,
  listQuery = '',
  onToggle,
  person,
  personBasePath = '/people',
  selected = false,
  selectMode = false,
}: PersonCardProps) {
  const router = useRouter()
  const [coverPerson, setCoverPerson] = useState(person)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    setCoverPerson((current) => {
      // Keep a freshly chosen preview if parent refresh briefly returns an older auto cover.
      if (
        current.cover_locked &&
        current.cover_face_url &&
        current.id === person.id &&
        current.cover_face_url !== person.cover_face_url &&
        !person.cover_locked
      ) {
        return current
      }
      return person
    })
  }, [person])

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
        {coverPerson.cover_face_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={coverPerson.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            src={coverPerson.cover_face_url}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <UserRound className="h-16 w-16" />
          </div>
        )}
        {!selectMode && enableCoverPicker ? (
          <button
            className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-lg border border-white/80 bg-white/95 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#10233f] opacity-100 shadow-sm transition hover:bg-white sm:opacity-0 sm:group-hover:opacity-100"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setPickerOpen(true)
            }}
            type="button"
          >
            <ImageIcon className="h-3 w-3" />
            Preview
          </button>
        ) : null}
      </div>
      <div className="space-y-1 p-4">
        <p className="truncate text-sm font-semibold text-[#10233f]">{coverPerson.name}</p>
        <p className="text-xs text-slate-500">
          {coverPerson.photo_count} photo{coverPerson.photo_count === 1 ? '' : 's'}
        </p>
      </div>
    </>
  )

  const picker = enableCoverPicker ? (
    <PersonCoverPicker
      onOpenChange={setPickerOpen}
      onUpdated={(updated) => {
        setCoverPerson(updated)
        router.refresh()
      }}
      open={pickerOpen}
      person={coverPerson}
    />
  ) : null

  if (selectMode) {
    return (
      <>
        <button
          className={`group w-full overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
            selected ? 'border-[#10233f] ring-2 ring-[#10233f]/15' : 'border-slate-200/80'
          }`}
          onClick={onToggle}
          type="button"
        >
          {cardBody}
        </button>
        {picker}
      </>
    )
  }

  return (
    <>
      <Link
        className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        href={buildPersonHref(personBasePath, coverPerson.id, {
          listPage,
          listQuery,
        })}
      >
        {cardBody}
      </Link>
      {picker}
    </>
  )
}
