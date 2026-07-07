import { downloadAudioViaInvidious } from '../lib/reels-maker/youtube-invidious.ts'
import { downloadAudioViaPiped } from '../lib/reels-maker/youtube-piped.ts'

const videoId = process.argv[2] || 'WerQABDxisM'
const mode = process.argv[3] || 'piped'

async function run() {
  const result =
    mode === 'invidious' ? await downloadAudioViaInvidious(videoId) : await downloadAudioViaPiped(videoId)

  console.log(
    JSON.stringify({
      ok: true,
      mode,
      bytes: result.buffer.length,
      extension: result.extension,
      title: result.title,
    }),
  )
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, mode, error: error instanceof Error ? error.message : String(error) }))
  process.exit(1)
})
