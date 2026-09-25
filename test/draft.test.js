import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSequence, draftTeamSizes } from '../src/draft.js';

test('alternating repeats the teams in order', () => {
  assert.deepEqual(draftSequence(2, 6, 'alternating'), [0, 1, 0, 1, 0, 1]);
  assert.deepEqual(draftSequence(3, 7, 'alternating'), [0, 1, 2, 0, 1, 2, 0]);
});

test('snake reverses every other round', () => {
  assert.deepEqual(draftSequence(2, 6, 'snake'), [0, 1, 1, 0, 0, 1]);
  assert.deepEqual(draftSequence(3, 6, 'snake'), [0, 1, 2, 2, 1, 0]);
  assert.deepEqual(draftSequence(3, 9, 'snake'), [0, 1, 2, 2, 1, 0, 0, 1, 2]);
});

test('the sequence is truncated to exactly the pick count', () => {
  assert.deepEqual(draftSequence(3, 4, 'snake'), [0, 1, 2, 2]);
  assert.deepEqual(draftSequence(3, 1, 'alternating'), [0]);
  assert.deepEqual(draftSequence(3, 0, 'snake'), []);
});

test('every team gets its due share for any pick count', () => {
  for (const order of ['snake', 'alternating']) {
    for (let teams = 2; teams <= 4; teams++) {
      for (let picks = 0; picks <= 12; picks++) {
        const sequence = draftSequence(teams, picks, order);
        assert.equal(sequence.length, picks, `${order} ${teams} ${picks}`);
        const counts = new Array(teams).fill(0);
        for (const t of sequence) counts[t]++;
        assert.ok(
          Math.max(...counts) - Math.min(...counts) <= 1,
          `${order} with ${teams} teams and ${picks} picks gave ${counts}`,
        );
      }
    }
  }
});

test('an unknown order is rejected', () => {
  assert.throws(() => draftSequence(2, 4, 'spiral'), /unknown draft order/i);
});

test('draftTeamSizes counts the captain plus their picks', () => {
  assert.deepEqual(draftTeamSizes(13, 2, 'snake'), [6, 7]);
  assert.deepEqual(draftTeamSizes(13, 2, 'alternating'), [7, 6]);
  assert.deepEqual(draftTeamSizes(14, 2, 'snake'), [7, 7]);
  assert.deepEqual(draftTeamSizes(11, 3, 'snake'), [4, 4, 3]);
});
