export function filterPortalPhotosByFileName<
  T extends { original_file_name: string; subfolder_name?: string | null },
>(photos: T[], query: string): T[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return photos

  return photos.filter(
    (photo) =>
      photo.original_file_name.toLowerCase().includes(normalizedQuery) ||
      (photo.subfolder_name?.toLowerCase().includes(normalizedQuery) ?? false),
  )
}
