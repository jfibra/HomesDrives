declare module 'youtube-dl-exec' {
  type YtDlpOptions = Record<string, string | number | boolean | undefined>

  function youtubedl(url: string, options?: YtDlpOptions): Promise<unknown>
  export default youtubedl
}
