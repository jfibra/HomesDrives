'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PortalFolderNode } from '@/lib/portals/types'
import { ChevronRight, EyeOff, Folder, FolderOpen, GripVertical } from 'lucide-react'

type FolderTreeProps = {
  nodes: PortalFolderNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  depth?: number
  variant?: 'default' | 'photographer'
  showPublicVisibility?: boolean
  enableReorder?: boolean
  reorderDepth?: number
  isReordering?: boolean
  onReorder?: (parentFolderId: string | null, draggedId: string, targetId: string) => void
}

type FolderTreeListProps = FolderTreeProps & {
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
  parentFolderId: string | null
}

function collectAncestorIds(
  nodes: PortalFolderNode[],
  targetId: string,
  ancestors: string[] = [],
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return ancestors
    if (node.children.length > 0) {
      const found = collectAncestorIds(node.children, targetId, [...ancestors, node.id])
      if (found) return found
    }
  }
  return null
}

function FolderTreeList({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
  variant = 'default',
  expandedIds,
  onToggleExpand,
  showPublicVisibility = false,
  enableReorder = false,
  reorderDepth = 0,
  isReordering = false,
  onReorder,
  parentFolderId,
}: FolderTreeListProps) {
  const isPhotographer = variant === 'photographer'
  const canReorder = enableReorder && depth === reorderDepth && !isReordering
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  if (nodes.length === 0) {
    return <p className="text-sm text-slate-500">No folders yet.</p>
  }

  return (
    <ul className="space-y-0.5">
      {nodes.map((node) => {
        const isSelected = selectedId === node.id
        const Icon = isSelected ? FolderOpen : Folder
        const hasChildren = node.children.length > 0
        const isExpanded = expandedIds.has(node.id)
        const badgeCount = depth === 0 ? node.children.length : node.photo_count
        const isDragOver = dragOverId === node.id
        const isDragging = draggedId === node.id

        return (
          <li
            className={isDragOver ? 'rounded-lg ring-2 ring-[#10233f]/15' : undefined}
            key={node.id}
            onDragLeave={() => {
              if (dragOverId === node.id) setDragOverId(null)
            }}
            onDragOver={(event) => {
              if (!canReorder || !draggedId || draggedId === node.id) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverId(node.id)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!canReorder || !draggedId || draggedId === node.id) return
              onReorder?.(parentFolderId, draggedId, node.id)
              setDraggedId(null)
              setDragOverId(null)
            }}
          >
            <div
              className={
                isSelected
                  ? isPhotographer
                    ? 'flex w-full items-center gap-1 rounded-xl bg-[#c6603d]/10 px-2 py-2.5 text-left text-sm font-semibold text-[#ae5536] ring-1 ring-[#c6603d]/15 transition'
                    : 'flex w-full items-center gap-1 rounded-lg bg-blue-50 px-2 py-2 text-left text-sm font-semibold text-blue-700 transition'
                  : isPhotographer
                    ? 'flex w-full items-center gap-1 rounded-xl px-2 py-2.5 text-left text-sm text-slate-600 transition hover:bg-white/80 hover:text-[#10233f]'
                    : `flex w-full items-center gap-1 rounded-lg px-2 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 ${
                        isDragging ? 'opacity-50' : ''
                      }`
              }
              style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
              {canReorder ? (
                <button
                  aria-label={`Drag to reorder ${node.folder_name}`}
                  className="shrink-0 cursor-grab rounded p-0.5 text-slate-400 transition hover:text-slate-600 active:cursor-grabbing"
                  draggable
                  onClick={(event) => event.stopPropagation()}
                  onDragEnd={() => {
                    setDraggedId(null)
                    setDragOverId(null)
                  }}
                  onDragStart={(event) => {
                    setDraggedId(node.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', node.id)
                  }}
                  type="button"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span aria-hidden className="inline-block w-4 shrink-0" />
              )}
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  if (hasChildren) {
                    onToggleExpand(node.id)
                  }
                  onSelect(node.id)
                }}
                type="button"
              >
                {hasChildren ? (
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                ) : (
                  <span aria-hidden className="inline-block w-3.5 shrink-0" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{node.folder_name}</span>
                {showPublicVisibility && !node.is_public_visible ? (
                  <EyeOff
                    aria-label="Hidden from public"
                    className="h-3.5 w-3.5 shrink-0 text-slate-400"
                  />
                ) : null}
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    isSelected
                      ? isPhotographer
                        ? 'bg-[#c6603d]/15 text-[#ae5536]'
                        : 'text-blue-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {badgeCount}
                </span>
              </button>
            </div>
            {hasChildren && isExpanded ? (
              <FolderTreeList
                depth={depth + 1}
                enableReorder={enableReorder}
                expandedIds={expandedIds}
                isReordering={isReordering}
                nodes={node.children}
                onReorder={onReorder}
                onSelect={onSelect}
                onToggleExpand={onToggleExpand}
                parentFolderId={node.id}
                reorderDepth={reorderDepth}
                selectedId={selectedId}
                showPublicVisibility={showPublicVisibility}
                variant={variant}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function FolderTree(props: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

  const ancestorIds = useMemo(() => {
    if (!props.selectedId) return []
    return collectAncestorIds(props.nodes, props.selectedId) ?? []
  }, [props.nodes, props.selectedId])

  useEffect(() => {
    if (ancestorIds.length === 0) return
    setExpandedIds((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const id of ancestorIds) {
        if (!next.has(id)) {
          next.add(id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [ancestorIds])

  const onToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <FolderTreeList
      {...props}
      expandedIds={expandedIds}
      onToggleExpand={onToggleExpand}
      parentFolderId={null}
    />
  )
}
