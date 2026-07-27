/** Cosine similarity for L2-normalized ArcFace embeddings. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0

  let dot = 0
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]
  }
  return dot
}
