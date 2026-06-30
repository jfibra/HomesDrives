const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif)$/i

export function derivePersonNameFromFileName(fileName: string): string | null {
  const trimmed = fileName.trim()
  if (!trimmed) return null

  const withoutExtension = trimmed.replace(IMAGE_EXTENSION_PATTERN, '').trim()
  if (!withoutExtension) return null

  const cleaned = withoutExtension
    .replace(/[_]+/g, ' ')
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.length > 0 ? cleaned : null
}
