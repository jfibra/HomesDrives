import type { ReactNode } from 'react'
import type { Person } from '@/lib/types/people'
import PersonCard from '@/components/people/PersonCard'

type PeopleGridProps = {
  emptyAction?: ReactNode
  onTogglePerson?: (personId: string) => void
  people: Person[]
  personBasePath?: string
  selectedPersonIds?: Set<string>
}

export default function PeopleGrid({
  emptyAction,
  onTogglePerson,
  people,
  personBasePath = '/people',
  selectedPersonIds,
}: PeopleGridProps) {
  const selectMode = Boolean(onTogglePerson && selectedPersonIds)

  if (people.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-600">No people found yet</p>
        <p className="mt-1 max-w-md text-xs text-slate-500">
          Faces are grouped automatically when photos are uploaded and processed by the face recognition
          service.
        </p>
        {emptyAction}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {people.map((person) => (
        <PersonCard
          key={person.id}
          onToggle={onTogglePerson ? () => onTogglePerson(person.id) : undefined}
          person={person}
          personBasePath={personBasePath}
          selected={selectedPersonIds?.has(person.id) ?? false}
          selectMode={selectMode}
        />
      ))}
    </div>
  )
}
