import type { PortalFolder, PortalFolderNode } from './types'

export function buildFolderTree(folders: PortalFolder[]): PortalFolderNode[] {
  const byId = new Map<string, PortalFolderNode>()
  for (const folder of folders) {
    byId.set(folder.id, { ...folder, children: [] })
  }

  const roots: PortalFolderNode[] = []
  for (const node of byId.values()) {
    if (node.parent_folder_id && byId.has(node.parent_folder_id)) {
      byId.get(node.parent_folder_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const aggregateCounts = (node: PortalFolderNode): number => {
    let total = node.photo_count ?? 0
    for (const child of node.children) {
      total += aggregateCounts(child)
    }
    node.photo_count = total
    return total
  }

  const sortNodes = (nodes: PortalFolderNode[]) => {
    nodes.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return b.created_at.localeCompare(a.created_at)
    })
    nodes.forEach((n) => sortNodes(n.children))
  }
  sortNodes(roots)

  for (const root of roots) {
    aggregateCounts(root)
  }
  return roots
}

export function reorderSiblingFolderNodes(
  nodes: PortalFolderNode[],
  draggedId: string,
  targetId: string,
): PortalFolderNode[] | null {
  if (draggedId === targetId) return null

  const ids = nodes.map((node) => node.id)
  const fromIndex = ids.indexOf(draggedId)
  const toIndex = ids.indexOf(targetId)
  if (fromIndex < 0 || toIndex < 0) return null

  const nextNodes = [...nodes]
  const [moved] = nextNodes.splice(fromIndex, 1)
  nextNodes.splice(toIndex, 0, moved)
  return nextNodes.map((node, index) => ({ ...node, sort_order: index }))
}

export function applySiblingReorder(
  tree: PortalFolderNode[],
  parentFolderId: string | null,
  draggedId: string,
  targetId: string,
): PortalFolderNode[] {
  if (parentFolderId === null) {
    return reorderSiblingFolderNodes(tree, draggedId, targetId) ?? tree
  }

  return tree.map((node) => {
    if (node.id === parentFolderId) {
      const reordered = reorderSiblingFolderNodes(node.children, draggedId, targetId)
      return reordered ? { ...node, children: reordered } : node
    }
    if (node.children.length === 0) return node
    return {
      ...node,
      children: applySiblingReorder(node.children, parentFolderId, draggedId, targetId),
    }
  })
}

export function collectFolderSortOrders(
  tree: PortalFolderNode[],
): Map<string, number> {
  const orderMap = new Map<string, number>()

  const walk = (nodes: PortalFolderNode[]) => {
    nodes.forEach((node, index) => {
      orderMap.set(node.id, index)
      if (node.children.length > 0) walk(node.children)
    })
  }

  walk(tree)
  return orderMap
}
