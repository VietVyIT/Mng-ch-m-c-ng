export function validateEmbedding(embedding) {
  return Array.isArray(embedding)
    && embedding.length === 128
    && embedding.every((value) => Number.isFinite(value));
}

export function validateEmbeddings(embeddings) {
  return Array.isArray(embeddings)
    && embeddings.length >= 1
    && embeddings.length <= 5
    && embeddings.every(validateEmbedding);
}

export function averageEmbeddings(embeddings) {
  if (!validateEmbeddings(embeddings)) return null;

  return embeddings[0].map((_, index) => (
    embeddings.reduce((sum, embedding) => sum + embedding[index], 0) / embeddings.length
  ));
}

export function faceDistance(first, second) {
  if (!validateEmbedding(first) || !validateEmbedding(second)) return Number.POSITIVE_INFINITY;

  let squaredDistance = 0;
  for (let index = 0; index < first.length; index += 1) {
    squaredDistance += (first[index] - second[index]) ** 2;
  }
  return Math.sqrt(squaredDistance);
}
