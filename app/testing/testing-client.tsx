'use client'

import { useCallback, useEffect, useState } from 'react'
import { Building2, List, Pencil, ScanSearch } from 'lucide-react'

import BuildingCameraScan from '@/components/buildings/BuildingCameraScan'
import BuildingEditForm from '@/components/buildings/BuildingEditForm'
import BuildingRegisterForm from '@/components/buildings/BuildingRegisterForm'
import Navbar from '@/components/Navbar'
import type { Building } from '@/lib/types/buildings'

type Tab = 'register' | 'scan' | 'dataset'

export default function TestingClient() {
  const [tab, setTab] = useState<Tab>('register')
  const [buildings, setBuildings] = useState<Building[]>([])
  const [editingBuildingId, setEditingBuildingId] = useState<string | null>(null)
  const [loadingBuildings, setLoadingBuildings] = useState(false)
  const [datasetError, setDatasetError] = useState('')

  const loadBuildings = useCallback(async () => {
    setLoadingBuildings(true)
    setDatasetError('')
    try {
      const response = await fetch('/api/buildings', { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to load buildings.',
        )
      }
      setBuildings(Array.isArray(data?.buildings) ? (data.buildings as Building[]) : [])
    } catch (error) {
      setDatasetError(error instanceof Error ? error.message : 'Unable to load buildings.')
      setBuildings([])
    } finally {
      setLoadingBuildings(false)
    }
  }, [])

  useEffect(() => {
    void loadBuildings()
  }, [loadBuildings])

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pb-8 sm:pt-20 lg:px-8">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-8">
          <h1 className="mb-4 text-xl font-semibold text-[#10233f] sm:mb-6 sm:text-3xl">
            Homes.ph Building Recognition
          </h1>

          <div className="mb-4 grid grid-cols-3 gap-2 border-b border-slate-100 pb-4 sm:mb-6 sm:pb-6">
            <button
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
                tab === 'register'
                  ? 'bg-[#10233f] text-white'
                  : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50'
              }`}
              onClick={() => {
                setEditingBuildingId(null)
                setTab('register')
              }}
              type="button"
            >
              <Building2 className="h-4 w-4" />
              Register
            </button>
            <button
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
                tab === 'scan'
                  ? 'bg-[#10233f] text-white'
                  : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50'
              }`}
              onClick={() => {
                setEditingBuildingId(null)
                setTab('scan')
              }}
              type="button"
            >
              <ScanSearch className="h-4 w-4" />
              Scan
            </button>
            <button
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-semibold transition sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
                tab === 'dataset'
                  ? 'bg-[#10233f] text-white'
                  : 'border border-slate-200 bg-white text-[#10233f] hover:bg-slate-50'
              }`}
              onClick={() => {
                setEditingBuildingId(null)
                setTab('dataset')
              }}
              type="button"
            >
              <List className="h-4 w-4" />
              Dataset ({buildings.length})
            </button>
          </div>

          {tab === 'register' ? (
            <BuildingRegisterForm
              onRegistered={() => {
                void loadBuildings()
                setTab('scan')
              }}
            />
          ) : null}

          {tab === 'scan' ? <BuildingCameraScan /> : null}

          {tab === 'dataset' && editingBuildingId ? (
            <BuildingEditForm
              buildingId={editingBuildingId}
              onCancel={() => setEditingBuildingId(null)}
              onSaved={() => {
                void loadBuildings()
              }}
            />
          ) : null}

          {tab === 'dataset' && !editingBuildingId ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[#10233f]">Registered buildings</h2>
                  <p className="text-sm text-slate-500">Edit details, listings, or add more reference photos.</p>
                </div>
                <button
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-[#10233f] hover:bg-slate-50"
                  onClick={() => void loadBuildings()}
                  type="button"
                >
                  Refresh
                </button>
              </div>

              {datasetError ? <p className="text-sm text-red-600">{datasetError}</p> : null}
              {loadingBuildings ? <p className="text-sm text-slate-500">Loading buildings…</p> : null}

              {!loadingBuildings && buildings.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                  No buildings registered yet. Use the Register tab to add your first test building.
                </p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {buildings.map((building) => (
                  <article
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white"
                    key={building.id}
                  >
                    <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
                      <div className="aspect-[4/3] bg-slate-100 sm:aspect-auto">
                        {building.cover_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            alt={building.name}
                            className="h-full w-full object-cover"
                            src={building.cover_image_url}
                          />
                        ) : (
                          <div className="flex h-full min-h-[120px] items-center justify-center text-slate-300">
                            <Building2 className="h-10 w-10" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-between gap-3 p-4">
                        <div className="space-y-2">
                          <h3 className="font-semibold text-[#10233f]">{building.name}</h3>
                          {building.full_address ? (
                            <p className="text-sm text-slate-500">{building.full_address}</p>
                          ) : null}
                          <p className="text-xs text-slate-400">
                            {building.reference_photo_count} reference photo
                            {building.reference_photo_count === 1 ? '' : 's'}
                            {' · '}
                            {building.listings.length} listing{building.listings.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <button
                          className="inline-flex min-h-9 w-fit items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-[#10233f] transition hover:bg-slate-50"
                          onClick={() => setEditingBuildingId(building.id)}
                          type="button"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
