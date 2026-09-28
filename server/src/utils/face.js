export function validateEmbedding(embedding) {
  return Array.isArray(embedding)
    && embedding.length === 128
    && embedding.every((value) => Number.isFinite(value));
}

export function faceDistance(first, second) {
  if (!validateEmbedding(first) || !validateEmbedding(second)) return Number.POSITIVE_INFINITY;

  let squaredDistance = 0;
  for (let index = 0; index < first.length; index += 1) {
    squaredDistance += (first[index] - second[index]) ** 2;
  }
  return Math.sqrt(squaredDistance);
}
