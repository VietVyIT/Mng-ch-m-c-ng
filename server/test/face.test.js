import test from 'node:test';
import assert from 'node:assert/strict';
import { averageEmbeddings, faceDistance, validateEmbedding, validateEmbeddings } from '../src/utils/face.js';

const embedding = Array(128).fill(0);

test('face embeddings must contain 128 finite numeric values', () => {
  assert.equal(validateEmbedding(embedding), true);
  assert.equal(validateEmbedding([...embedding, 0]), false);
  assert.equal(validateEmbedding([...embedding.slice(0, 127), Number.NaN]), false);
});

test('Euclidean face distance accepts the same face and rejects a different descriptor', () => {
  const sameFace = [...embedding];
  sameFace[0] = 0.2;
  const differentFace = [...embedding];
  differentFace[0] = 0.7;

  assert.equal(faceDistance(embedding, sameFace) <= 0.6, true);
  assert.equal(faceDistance(embedding, differentFace) > 0.6, true);
});

test('invalid face descriptors never match', () => {
  assert.equal(faceDistance(embedding, [1, 2, 3]), Number.POSITIVE_INFINITY);
});

test('multiple valid frames are averaged to reduce single-frame recognition noise', () => {
  const first = [...embedding];
  const second = [...embedding];
  const third = [...embedding];
  first[0] = 0.2;
  second[0] = 0.4;
  third[0] = 0.3;

  assert.equal(validateEmbeddings([first, second, third]), true);
  assert.ok(Math.abs(averageEmbeddings([first, second, third])[0] - 0.3) < Number.EPSILON);
  assert.equal(validateEmbeddings([first, [...embedding, 0]]), false);
  assert.equal(averageEmbeddings([first, ...Array(5).fill(second)]), null);
});
