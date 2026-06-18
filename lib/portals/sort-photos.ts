export function comparePortalPhotoFileNames(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function sortPortalPhotosByFileName<T extends { original_file_name: string }>(photos: T[]): T[] {
  return [...photos].sort((a, b) =>
    comparePortalPhotoFileNames(a.original_file_name, b.original_file_name),
  )
}
