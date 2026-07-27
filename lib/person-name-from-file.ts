const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|bmp|gif|heic|heif|avif)$/i

/** Camera / export dumps — never use these as a person display name. */
const GENERIC_CAMERA_NAME_PATTERN =
  /^(?:IMG|DSC|DCIM|PIC|PICTURE|PHOTO|IMAGE|P|SAM|MVIMG|BURST|Screenshot|Screen\s*Shot)(?:[_\s-]?\d+)+(?:\s*\(\d+\))?$/i

const MOSTLY_NUMERIC_NAME_PATTERN = /^\d+(?:\s+\d+)*$/

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

  if (!cleaned) return null
  if (GENERIC_CAMERA_NAME_PATTERN.test(cleaned)) return null
  if (MOSTLY_NUMERIC_NAME_PATTERN.test(cleaned)) return null

  return cleaned
}
