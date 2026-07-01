'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, FolderOpen, PanelLeft } from 'lucide-react'

import EventPhotographerPhotos from '@/components/portals/EventPhotographerPhotos'
import FolderTree from '@/components/portals/FolderTree'
import { getSubFolderCardColorByIndex } from '@/components/portals/sub-folder-card-colors'
import type { PortalFolder, PortalFolderNode, PortalPhoto } from '@/lib/portals/types'

type EventPhotographerBrowserProps = {
  photographerName: string
  folders: PortalFolder[]
  photosByFolderId: Record<string, PortalPhoto[]>
  tree: PortalFolderNode[]
}

export default function EventPhotographerBrowser({
  photographerName,
  folders,
  photosByFolderId,
  tree,
}: EventPhotographerBrowserProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [foldersPanelOpen, setFoldersPanelOpen] = useState(false)

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  )

  const parentFolder = useMemo(() => {
    if (!selectedFolder?.parent_folder_id) return null
    return folders.find((folder) => folder.id === selectedFolder.parent_folder_id) ?? null
  }, [folders, selectedFolder])

  const subFolders = useMemo(() => {
    if (!selectedFolder || selectedFolder.parent_folder_id) return []
    return folders.filter((folder) => folder.parent_folder_id === selectedFolder.id)
  }, [folders, selectedFolder])

  const isMainFolder = Boolean(selectedFolder && !selectedFolder.parent_folder_id)
  const isSubFolder = Boolean(selectedFolder?.parent_folder_id)
  const selectedPhotos = selectedFolderId ? photosByFolderId[selectedFolderId] ?? [] : []

  useEffect(() => {
    if (selectedFolderId) return
    const root = folders.find((folder) => !folder.parent_folder_id)
    if (root) setSelectedFolderId(root.id)
  }, [folders, selectedFolderId])

  function handleFolderSelect(id: string) {
    setSelectedFolderId(id)
    setFoldersPanelOpen(false)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/80 bg-white/75 shadow-[0_20px_60px_-12px_rgba(16,35,63,0.12)] backdrop-blur-sm">
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className={`border-b border-slate-100/80 bg-gradient-to-b from-[#faf8f6] to-white p-4 sm:p-5 lg:border-b-0 lg:border-r ${
            foldersPanelOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[#10233f]">{photographerName}&apos;s folders</h3>
            <p className="text-xs text-slate-500">Main folders and sub-folders</p>
          </div>

          {tree.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-8 text-center">
              <FolderOpen className="mx-auto mb-2 h-6 w-6 text-slate-300" />
              <p className="text-sm text-slate-500">No folders yet.</p>
            </div>
          ) : (
            <FolderTree
              nodes={tree}
              onSelect={handleFolderSelect}
              selectedId={selectedFolderId}
              variant="photographer"
            />
          )}
        </aside>

        <div className="min-h-[360px] bg-gradient-to-br from-white via-white to-slate-50/60 p-4 sm:p-6 lg:p-8">
          <button
            className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#10233f] shadow-sm transition hover:bg-slate-50 lg:hidden"
            onClick={() => setFoldersPanelOpen((open) => !open)}
            type="button"
          >
            <PanelLeft className="h-4 w-4 shrink-0" />
            {foldersPanelOpen ? 'Hide folders' : 'Browse folders'}
            {selectedFolder ? (
              <span className="truncate text-slate-500">· {selectedFolder.folder_name}</span>
            ) : null}
          </button>

          {!selectedFolder ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200/80 bg-white/50 px-6 py-12 text-center">
              <FolderOpen className="mb-4 h-8 w-8 text-slate-300" />
              <p className="text-lg font-semibold text-[#10233f]">Select a folder</p>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                Pick a main folder to browse sub-folders, then open a sub-folder to view photos.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4 border-b border-slate-100/90 pb-5">
                {isSubFolder && parentFolder ? (
                  <button
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-[#10233f]"
                    onClick={() => setSelectedFolderId(parentFolder.id)}
                    type="button"
                  >
                    <ChevronLeft className="h-4 w-4 shrink-0" />
                    <span className="truncate">Back to {parentFolder.folder_name}</span>
                  </button>
                ) : null}
                <div className="min-w-0">
                  <span className="inline-flex rounded-full bg-[#10233f]/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#10233f]/70">
                    {isMainFolder ? 'Main folder' : 'Sub-folder'}
                  </span>
                  <h3 className="mt-2 break-words text-xl font-semibold tracking-tight text-[#10233f] sm:text-2xl">
                    {selectedFolder.folder_name}
                  </h3>
                </div>
              </div>

              {isMainFolder ? (
                subFolders.length > 0 ? (
                  <div className="mt-6">
                    <h4 className="mb-3 text-sm font-semibold text-[#10233f]">Sub-folders</h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {subFolders.map((folder, index) => {
                        const colors = getSubFolderCardColorByIndex(index)
                        const photoCount = photosByFolderId[folder.id]?.length ?? folder.photo_count

                        return (
                          <button
                            className={`rounded-2xl border-2 px-4 py-4 text-left text-sm font-medium shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${colors.card}`}
                            key={folder.id}
                            onClick={() => handleFolderSelect(folder.id)}
                            type="button"
                          >
                            <span className={`block truncate text-base font-semibold ${colors.title}`}>
                              {folder.folder_name}
                            </span>
                            <span className={`mt-1.5 block text-xs ${colors.meta}`}>
                              {photoCount} photo{photoCount === 1 ? '' : 's'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 rounded-[1.5rem] border border-dashed border-slate-200/80 bg-white/60 px-6 py-10 text-center">
                    <p className="text-sm text-slate-500">No sub-folders in this main folder yet.</p>
                  </div>
                )
              ) : null}

              {isSubFolder ? (
                <div className="mt-6">
                  <h4 className="mb-4 text-sm font-semibold text-[#10233f]">
                    Photos ({selectedPhotos.length})
                  </h4>
                  <EventPhotographerPhotos photos={selectedPhotos} />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
