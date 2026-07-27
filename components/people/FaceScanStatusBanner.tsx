import { ScanFace } from 'lucide-react'

type FaceScanStatusBannerProps = {
  pendingPhotos: number
  scannedPhotos: number
  totalPhotos: number
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value)
}

export default function FaceScanStatusBanner({
  pendingPhotos,
  scannedPhotos,
  totalPhotos,
}: FaceScanStatusBannerProps) {
  const upToDate = pendingPhotos === 0

  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
        upToDate
          ? 'border-emerald-100 bg-emerald-50/80 text-emerald-900'
          : 'border-amber-100 bg-amber-50/80 text-amber-950'
      }`}
    >
      <ScanFace className={`mt-0.5 h-4 w-4 shrink-0 ${upToDate ? 'text-emerald-700' : 'text-amber-700'}`} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          Face scan: {formatCount(scannedPhotos)} / {formatCount(totalPhotos)} images scanned
          {!upToDate ? ` · ${formatCount(pendingPhotos)} pending` : ''}
        </p>
        <p className={`mt-1 text-xs ${upToDate ? 'text-emerald-800/80' : 'text-amber-900/80'}`}>
          {upToDate
            ? 'All scannable images have been processed. Each person’s count is photos where their face was found — not every event file.'
            : 'Scanning continues in the background while this workspace stays open. Use Deep match (keep people) to catch missed faces, or Rescan all to rebuild from scratch.'}
        </p>
      </div>
    </div>
  )
}
