'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, Trash2, X } from 'lucide-react'

import PeopleGrid from '@/components/people/PeopleGrid'
import type { Person } from '@/lib/types/people'

type PeopleGridManagerProps = {
  emptyAction?: ReactNode
  enableBulkDelete?: boolean
  people: Person[]
  personBasePath?: string
}

export default function PeopleGridManager({
  emptyAction,
  enableBulkDelete = false,
  people,
  personBasePath = '/people',
}: PeopleGridManagerProps) {
  const router = useRouter()
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const allSelected = people.length > 0 && selectedIds.length === people.length

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds([])
    setError('')
  }

  function togglePerson(personId: string) {
    setSelectedIds((current) =>
      current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId],
    )
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? [] : people.map((person) => person.id))
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return

    const count = selectedIds.length
    const confirmed = window.confirm(
      `Remove ${count} selected ${count === 1 ? 'person' : 'people'}? Use this for blurry previews or entries with no real face.`,
    )
    if (!confirmed) return

    setIsDeleting(true)
    setError('')
    try {
      const response = await fetch('/api/people/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds: selectedIds }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to remove selected people.')
      }

      exitSelectMode()
      router.refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to remove selected people.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div>
      {enableBulkDelete && people.length > 0 ? (
        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 p-4">
          {selectMode ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#10233f]">
                    {selectedIds.length} selected
                  </p>
                  <p className="text-xs text-slate-500">
                    Tap cards to select blurry or false face previews, then remove them.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={toggleSelectAll}
                    type="button"
                  >
                    {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                    {allSelected ? 'Deselect all' : 'Select all on page'}
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isDeleting || selectedIds.length === 0}
                    onClick={() => void removeSelected()}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting
                      ? 'Removing…'
                      : `Remove selected${selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}`}
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    disabled={isDeleting}
                    onClick={exitSelectMode}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                See blurry or empty face previews? Select and remove them from your library.
              </p>
              <button
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#10233f] shadow-sm transition hover:bg-slate-50"
                onClick={() => {
                  setError('')
                  setSelectMode(true)
                }}
                type="button"
              >
                <CheckSquare className="h-4 w-4" />
                Select people to remove
              </button>
            </div>
          )}
        </div>
      ) : null}

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <PeopleGrid
        emptyAction={emptyAction}
        onTogglePerson={selectMode ? togglePerson : undefined}
        people={people}
        personBasePath={personBasePath}
        selectedPersonIds={selectMode ? selectedSet : undefined}
      />
    </div>
  )
}
