export function validateEmbedding(embedding) {
  return Array.isArray(embedding)
    && embedding.length === 128
    && embedding.every((value) => Number.isFinite(value));
}

export function cosineSimilarity(first, second) {
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;
  for (let index = 0; index < first.length; index += 1) {
    dot += first[index] * second[index];
    firstMagnitude += first[index] ** 2;
    secondMagnitude += second[index] ** 2;
  }
  const denominator = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}
