'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Navbar from '@/components/Navbar'
import AdminMapView from '@/components/admin/AdminMapView'
import type { MapFolder } from '@/components/admin/AdminMapView'

export default function MapPage() {
  const [folders, setFolders] = useState<MapFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const fetchedRef = useRef(false)

  const load = useCallback(async () => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    try {
      const r = await fetch('/api/folders/map')
      const data = await r.json().catch(() => null)
      if (r.ok && Array.isArray(data?.folders)) {
        setFolders(data.folders as MapFolder[])
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />
      <div className="flex-1 pt-20">
        {isLoading ? (
          <div
            className="flex h-full items-center justify-center text-sm"
            style={{ color: '#74777f', backgroundColor: '#f9f9ff' }}
          >
            Loading map…
          </div>
        ) : (
          <AdminMapView
            folders={folders}
            onOpenFolder={() => {}}
          />
        )}
      </div>
    </div>
  )
}
