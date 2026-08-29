import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamSizes, pickRotation, teamLabel, createTeams, validateSetup, toggleCaptain, MAX_TEAMS,
} from '../src/teams.js';

test('the remainder lands on the earliest teams', () => {
  assert.deepEqual(teamSizes(5, 2), [3, 2]);
  assert.deepEqual(teamSizes(7, 3), [3, 2, 2]);
  assert.deepEqual(teamSizes(8, 2), [4, 4]);
  assert.deepEqual(teamSizes(4, 2), [2, 2]);
  assert.deepEqual(teamSizes(6, 2), [3, 3]);
});

test('sizes always sum to the headcount and stay within one of even', () => {
  for (let n = 2; n <= 16; n++) {
    for (let k = 2; k <= Math.min(5, n); k++) {
      const sizes = teamSizes(n, k);
      assert.equal(sizes.length, k, `${n} over ${k}`);
      assert.equal(sizes.reduce((a, b) => a + b, 0), n, `${n} over ${k}`);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n} over ${k}`);
    }
  }
});

test('the plain rotation fills exactly the computed sizes', () => {
  for (let n = 2; n <= 16; n++) {
    for (let k = 2; k <= Math.min(5, n); k++) {
      const rotation = pickRotation(n, k);
      assert.equal(rotation.length, n, `${n} over ${k}`);
      const counts = new Array(k).fill(0);
      for (const teamIndex of rotation) counts[teamIndex]++;
      assert.deepEqual(counts, teamSizes(n, k), `${n} over ${k}`);
    }
  }
});

test('rotation order is A, B, A, B for two teams', () => {
  assert.deepEqual(pickRotation(5, 2), [0, 1, 0, 1, 0]);
});

test('teamLabel names teams A through H', () => {
  assert.equal(teamLabel(0), 'Team A');
  assert.equal(teamLabel(1), 'Team B');
  assert.equal(teamLabel(MAX_TEAMS - 1), 'Team H');
});

test('createTeams builds empty labelled teams', () => {
  assert.deepEqual(createTeams(2), [
    { name: 'Team A', members: [] },
    { name: 'Team B', members: [] },
  ]);
});

test('validateSetup accepts a normal night', () => {
  assert.deepEqual(validateSetup({ presentCount: 6, teamCount: 2 }), { ok: true });
});

test('validateSetup rejects a team count outside 2 to 8', () => {
  assert.equal(validateSetup({ presentCount: 6, teamCount: 1 }).reason, 'Teams must be between 2 and 8');
  assert.equal(validateSetup({ presentCount: 20, teamCount: 9 }).reason, 'Teams must be between 2 and 8');
});

test('validateSetup rejects fewer than two people', () => {
  assert.equal(validateSetup({ presentCount: 1, teamCount: 2 }).reason, 'Need at least 2 people');
});

test('validateSetup rejects fewer people than teams', () => {
  assert.equal(
    validateSetup({ presentCount: 2, teamCount: 3 }).reason,
    'Need at least 3 people for 3 teams',
  );
});

test('toggleCaptain adds someone who is not yet a captain', () => {
  assert.deepEqual(toggleCaptain(['a'], 'b', 2), ['a', 'b']);
});

test('toggleCaptain removes someone who already is one', () => {
  assert.deepEqual(toggleCaptain(['a', 'b'], 'a', 2), ['b']);
});

test('toggleCaptain refuses to add past the limit', () => {
  assert.deepEqual(toggleCaptain(['a', 'b'], 'c', 2), ['a', 'b']);
});

// Deselecting has to keep working at the limit, or a full set would be a dead
// end: every chip disabled and no way to change your mind without starting over.
test('toggleCaptain still removes when the limit is already reached', () => {
  assert.deepEqual(toggleCaptain(['a', 'b'], 'b', 2), ['a']);
});

test('toggleCaptain does not mutate the array it is given', () => {
  const before = ['a'];
  toggleCaptain(before, 'b', 2);
  assert.deepEqual(before, ['a']);
});
