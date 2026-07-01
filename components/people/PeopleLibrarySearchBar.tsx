'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

const SEARCH_DEBOUNCE_MS = 300

type PeopleLibrarySearchBarProps = {
  defaultValue?: string
}

export default function PeopleLibrarySearchBar({ defaultValue = '' }: PeopleLibrarySearchBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    setValue(defaultValue)
  }, [defaultValue])

  const applySearch = useCallback(
    (nextValue: string) => {
      const trimmed = nextValue.trim()
      const current = (searchParams.get('q') ?? '').trim()

      if (trimmed === current) {
        return
      }

      const params = new URLSearchParams(searchParams.toString())

      if (trimmed) {
        params.set('q', trimmed)
      } else {
        params.delete('q')
      }

      params.delete('page')

      const queryString = params.toString()
      router.push(queryString ? `${pathname}?${queryString}` : pathname)
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    const trimmed = value.trim()
    const current = defaultValue.trim()

    if (trimmed === current) {
      return
    }

    const timer = window.setTimeout(() => {
      applySearch(value)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [applySearch, defaultValue, value])

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-[#10233f] outline-none transition placeholder:text-slate-400 focus:border-[#10233f] focus:ring-2 focus:ring-[#10233f]/10"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search people by name..."
        type="search"
        value={value}
      />
      {value ? (
        <button
          aria-label="Clear search"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          onClick={() => {
            setValue('')
            applySearch('')
          }}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  )
}
