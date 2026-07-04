'use client'

import { FileImage, Folder, MoreVertical } from 'lucide-react'

import type { PortalFolder, PortalPhoto } from '@/lib/portals/types'

export type AdminDriveRow =
  | { kind: 'folder'; folder: PortalFolder }
  | { kind: 'photo'; photo: PortalPhoto }

type AdminFolderDriveTableProps = {
  onOpenFolder: (folderId: string) => void
  onOpenPhoto?: (photo: PortalPhoto) => void
  rows: AdminDriveRow[]
}

function formatDriveDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ownerLabel(folder: PortalFolder) {
  return folder.owner_name?.trim() || folder.uploader_name?.trim() || folder.uploader_code || '—'
}

function photoOwnerLabel(photo: PortalPhoto) {
  return photo.owner_name?.trim() || photo.uploader_name?.trim() || photo.uploader_code || '—'
}

export default function AdminFolderDriveTable({
  onOpenFolder,
  onOpenPhoto,
  rows,
}: AdminFolderDriveTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center text-sm text-slate-500">
        Nothing here yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Owner</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Date modified</th>
              <th className="px-4 py-3 font-semibold">File size</th>
              <th className="w-10 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              if (row.kind === 'folder') {
                const folder = row.folder
                return (
                  <tr
                    className="group cursor-pointer transition hover:bg-slate-50"
                    key={`folder-${folder.id}`}
                    onClick={() => onOpenFolder(folder.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenFolder(folder.id)
                      }
                    }}
                    tabIndex={0}
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Folder className="h-5 w-5 shrink-0 text-[#5f6368]" />
                        <span className="truncate font-medium text-[#10233f]">{folder.folder_name}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{ownerLabel(folder)}</td>
                    <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                      {formatDriveDate(folder.created_at)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">—</td>
                    <td className="px-2 py-3 text-slate-400">
                      <MoreVertical className="mx-auto h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                    </td>
                  </tr>
                )
              }

              const photo = row.photo
              return (
                <tr
                  className="group cursor-pointer transition hover:bg-slate-50"
                  key={`photo-${photo.id}`}
                  onClick={() => onOpenPhoto?.(photo)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenPhoto?.(photo)
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileImage className="h-5 w-5 shrink-0 text-[#5f6368]" />
                      <span className="truncate font-medium text-[#10233f]">{photo.original_file_name}</span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{photoOwnerLabel(photo)}</td>
                  <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                    {formatDriveDate(photo.created_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatFileSize(photo.file_size_bytes)}</td>
                  <td className="px-2 py-3 text-slate-400">
                    <MoreVertical className="mx-auto h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
