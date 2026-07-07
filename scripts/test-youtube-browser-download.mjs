import { downloadYouTubeAudioInBrowser } from '../lib/reels-maker/youtube-browser-download.ts'
import { resolveYouTubeStreamInBrowser } from '../lib/reels-maker/youtube-browser-resolve.ts'
import { resolveYouTubeStreamInfo } from '../lib/reels-maker/youtube-stream-info.ts'

const youtubeUrl = process.argv[2] || 'https://www.youtube.com/watch?v=WerQABDxisM'
const mode = process.argv[3] || 'full'

async function run() {
  if (mode === 'resolve') {
    const stream = await resolveYouTubeStreamInBrowser(youtubeUrl)
    console.log(JSON.stringify({ ok: true, mode, stream }, null, 2))
    return
  }

  if (mode === 'server') {
    const stream = await resolveYouTubeStreamInfo(youtubeUrl)
    console.log(JSON.stringify({ ok: true, mode, stream }, null, 2))
    return
  }

  const file = await downloadYouTubeAudioInBrowser(youtubeUrl)
  console.log(
    JSON.stringify({
      ok: true,
      mode: 'full',
      fileName: file.name,
      mimeType: file.type,
      bytes: file.size,
    }),
  )
}

run().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      mode,
      error: error instanceof Error ? error.message : String(error),
      hint: 'Set COBALT_API_KEY in .env for server fallback, or test from the reels UI in a browser.',
    }),
  )
  process.exit(1)
})
