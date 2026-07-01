import Link from 'next/link'

type PeoplePaginationProps = {
  basePath: string
  page: number
  searchQuery?: string
  totalPages: number
}

function buildHref(basePath: string, page: number, searchQuery?: string) {
  const params = new URLSearchParams()
  if (page > 1) {
    params.set('page', String(page))
  }
  const trimmed = searchQuery?.trim()
  if (trimmed) {
    params.set('q', trimmed)
  }
  const queryString = params.toString()
  return queryString ? `${basePath}?${queryString}` : basePath
}

export default function PeoplePagination({
  basePath,
  page,
  searchQuery,
  totalPages,
}: PeoplePaginationProps) {
  if (totalPages <= 1) return null

  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    const start = Math.max(1, Math.min(page - 2, totalPages - 4))
    return start + index
  }).filter((value) => value >= 1 && value <= totalPages)

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-2">
      <Link
        aria-disabled={page <= 1}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        href={page > 1 ? buildHref(basePath, page - 1, searchQuery) : buildHref(basePath, 1, searchQuery)}
      >
        Previous
      </Link>
      {pages.map((pageNumber) => (
        <Link
          className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
            pageNumber === page
              ? 'bg-[#10233f] text-white'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          href={buildHref(basePath, pageNumber, searchQuery)}
          key={pageNumber}
        >
          {pageNumber}
        </Link>
      ))}
      <Link
        aria-disabled={page >= totalPages}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        href={page < totalPages ? buildHref(basePath, page + 1, searchQuery) : buildHref(basePath, totalPages, searchQuery)}
      >
        Next
      </Link>
    </nav>
  )
}
