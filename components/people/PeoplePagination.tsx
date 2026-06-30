import Link from 'next/link'

type PeoplePaginationProps = {
  basePath: string
  page: number
  totalPages: number
}

export default function PeoplePagination({ basePath, page, totalPages }: PeoplePaginationProps) {
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
        href={page > 1 ? `${basePath}?page=${page - 1}` : basePath}
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
          href={`${basePath}?page=${pageNumber}`}
          key={pageNumber}
        >
          {pageNumber}
        </Link>
      ))}
      <Link
        aria-disabled={page >= totalPages}
        className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-40"
        href={page < totalPages ? `${basePath}?page=${page + 1}` : `${basePath}?page=${totalPages}`}
      >
        Next
      </Link>
    </nav>
  )
}
