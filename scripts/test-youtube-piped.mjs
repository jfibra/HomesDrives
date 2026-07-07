import { downloadAudioViaPiped } from '../lib/reels-maker/youtube-piped.ts'

const videoId = process.argv[2] || 'WerQABDxisM'

downloadAudioViaPiped(videoId)
  .then((result) => {
    console.log(
      JSON.stringify({
        ok: true,
        bytes: result.buffer.length,
        extension: result.extension,
        title: result.title,
      }),
    )
  })
  .catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    process.exit(1)
  })
