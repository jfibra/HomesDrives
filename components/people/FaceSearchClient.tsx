'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Camera, Loader2, Search, Upload, UserRound } from 'lucide-react'

import FaceCameraSearch from '@/components/people/FaceCameraSearch'
import PersonGallery from '@/components/people/PersonGallery'
import { PORTAL_ADMIN_SESSION_KEY } from '@/lib/portals/constants'
import type { FaceSearchMatch, FaceSearchResult } from '@/lib/types/people'

type FaceSearchClientProps = {
  includeAdminCode?: boolean
  personBasePath?: string
  searchUrl?: string
}

type SearchMode = 'camera' | 'upload'

function parseSearchResponse(data: Record<string, unknown> | null): FaceSearchResult {
  const matches: FaceSearchMatch[] = Array.isArray(data?.matches)
    ? data.matches
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const row = entry as Record<string, unknown>
          const person = row.person
          if (!person || typeof person !== 'object') return null
          const p = person as Record<string, unknown>
          if (typeof p.id !== 'string') return null
          return {
            person: {
              id: p.id,
              name: typeof p.name === 'string' ? p.name : 'Unknown',
              cover_face_url:
                typeof p.cover_face_url === 'string' && p.cover_face_url.trim()
                  ? p.cover_face_url.trim()
                  : null,
              photo_count: typeof p.photo_count === 'number' ? p.photo_count : 0,
              created_at: typeof p.created_at === 'string' ? p.created_at : '',
            },
            similarity: typeof row.similarity === 'number' ? row.similarity : 0,
          }
        })
        .filter((entry): entry is FaceSearchMatch => Boolean(entry))
    : []

  const personData =
    data?.person && typeof data.person === 'object' ? (data.person as Record<string, unknown>) : null

  return {
    person: personData && typeof personData.id === 'string'
      ? {
          id: personData.id,
          name: typeof personData.name === 'string' ? personData.name : 'Unknown',
          cover_face_url:
            typeof personData.cover_face_url === 'string' && personData.cover_face_url.trim()
              ? personData.cover_face_url.trim()
              : null,
          photo_count: typeof personData.photo_count === 'number' ? personData.photo_count : 0,
          created_at: typeof personData.created_at === 'string' ? personData.created_at : '',
        }
      : matches[0]?.person ?? null,
    photos: Array.isArray(data?.photos) ? (data.photos as FaceSearchResult['photos']) : [],
    bestSimilarity: typeof data?.bestSimilarity === 'number' ? data.bestSimilarity : matches[0]?.similarity ?? null,
    matches,
    noFaceDetected: Boolean(data?.noFaceDetected),
  }
}

function FaceSearchMatchesGrid({
  matches,
  personBasePath,
}: {
  matches: FaceSearchMatch[]
  personBasePath: string
}) {
  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm text-slate-500">
        No matching people found above the similarity threshold.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {matches.map((match, index) => (
        <Link
          className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          href={`${personBasePath}/${match.person.id}`}
          key={match.person.id}
        >
          <div className="relative aspect-square overflow-hidden bg-slate-100">
            {match.person.cover_face_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={match.person.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                src={match.person.cover_face_url}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-300">
                <UserRound className="h-16 w-16" />
              </div>
            )}
            <span className="absolute bottom-2 right-2 rounded-full bg-[#10233f] px-2 py-0.5 text-[11px] font-semibold text-white">
              {Math.round(match.similarity * 100)}%
            </span>
            {index === 0 ? (
              <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Best
              </span>
            ) : null}
          </div>
          <div className="space-y-1 p-4">
            <p className="truncate text-sm font-semibold text-[#10233f]">{match.person.name}</p>
            <p className="text-xs text-slate-500">
              {match.person.photo_count} photo{match.person.photo_count === 1 ? '' : 's'}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}

export default function FaceSearchClient({
  includeAdminCode = false,
  personBasePath = '/people',
  searchUrl = '/api/people/search',
}: FaceSearchClientProps) {
  const [mode, setMode] = useState<SearchMode>('camera')
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<FaceSearchResult | null>(null)

  function handleFileChange(nextFile: File | null) {
    setError('')
    setResult(null)
    setFile(nextFile)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null)
  }

  async function handleSearch() {
    if (!file) {
      setError('Choose a face photo to search.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('limit', '12')
      if (includeAdminCode) {
        const adminCode = window.localStorage.getItem(PORTAL_ADMIN_SESSION_KEY)?.trim() ?? ''
        if (!adminCode) {
          throw new Error('Admin session expired. Sign in again from the admin portal.')
        }
        formData.append('adminCode', adminCode)
      }

      const response = await fetch(searchUrl, {
        method: 'POST',
        body: formData,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Face search failed.',
        )
      }

      setResult(parseSearchResponse(data as Record<string, unknown>))
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Face search failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
        <button
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === 'camera' ? 'bg-white text-[#10233f] shadow-sm' : 'text-slate-600 hover:text-[#10233f]'
          }`}
          onClick={() => setMode('camera')}
          type="button"
        >
          <Camera className="h-4 w-4" />
          Live camera
        </button>
        <button
          className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
            mode === 'upload' ? 'bg-white text-[#10233f] shadow-sm' : 'text-slate-600 hover:text-[#10233f]'
          }`}
          onClick={() => setMode('upload')}
          type="button"
        >
          <Upload className="h-4 w-4" />
          Upload photo
        </button>
      </div>

      {mode === 'camera' ? (
        <FaceCameraSearch
          includeAdminCode={includeAdminCode}
          personBasePath={personBasePath}
          searchUrl={searchUrl}
        />
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center transition hover:border-[#10233f]/30 hover:bg-slate-50">
                <input
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
                  type="file"
                />
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt="Face preview"
                    className="mb-3 h-40 w-40 rounded-full object-cover shadow-md"
                    src={previewUrl}
                  />
                ) : (
                  <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
                    <Upload className="h-7 w-7" />
                  </div>
                )}
                <p className="text-sm font-semibold text-[#10233f]">Upload a face photo</p>
                <p className="mt-1 text-xs text-slate-500">We&apos;ll find matching people in the library.</p>
              </label>

              <div className="flex flex-col justify-center gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#10233f]">Photo search</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Upload a clear photo of one face. Results are ranked by similarity against this
                    event&apos;s People library.
                  </p>
                </div>
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#10233f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1a3358] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  disabled={loading || !file}
                  onClick={() => void handleSearch()}
                  type="button"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {loading ? 'Searching…' : 'Search faces'}
                </button>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </div>
            </div>
          </div>

          {result ? (
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 text-sm font-semibold text-[#10233f]">
                  {result.matches.length > 0
                    ? `${result.matches.length} matching ${result.matches.length === 1 ? 'person' : 'people'}`
                    : 'Results'}
                </h3>
                <FaceSearchMatchesGrid matches={result.matches} personBasePath={personBasePath} />
              </div>

              {result.person && result.photos.length > 0 ? (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-[#10233f]">
                    Photos for {result.person.name}
                    {result.bestSimilarity != null
                      ? ` · ${Math.round(result.bestSimilarity * 100)}% match`
                      : ''}
                  </h3>
                  <PersonGallery photos={result.photos} />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
