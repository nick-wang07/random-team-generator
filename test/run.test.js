import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startRun, currentTeamIndex, applyPick, undoPick, isComplete, picksRemaining,
} from '../src/run.js';

function wheelRun(present = ['a', 'b', 'c', 'd']) {
  return startRun({ mode: 'wheel', present, teamCount: 2, order: [0, 1, 0, 1] });
}

test('a fresh run holds everyone in the pool and empty teams', () => {
  const run = wheelRun();
  assert.deepEqual(run.pool, ['a', 'b', 'c', 'd']);
  assert.deepEqual(run.teams.map((t) => t.members), [[], []]);
  assert.equal(run.turnIndex, 0);
  assert.equal(currentTeamIndex(run), 0);
  assert.equal(picksRemaining(run), 4);
});

test('seeded members start on their team and leave the pool', () => {
  const run = startRun({
    mode: 'draft', present: ['a', 'b', 'c', 'd'], teamCount: 2,
    order: [0, 1], seeded: [['a'], ['b']],
  });
  assert.deepEqual(run.teams.map((t) => t.members), [['a'], ['b']]);
  assert.deepEqual(run.pool, ['c', 'd']);
  assert.equal(picksRemaining(run), 2);
});

test('applyPick moves the person to the team whose turn it is', () => {
  const run = applyPick(wheelRun(), 'c');
  assert.deepEqual(run.teams[0].members, ['c']);
  assert.deepEqual(run.pool, ['a', 'b', 'd']);
  assert.equal(currentTeamIndex(run), 1);
});

test('applyPick does not mutate the run it was given', () => {
  const before = wheelRun();
  applyPick(before, 'a');
  assert.deepEqual(before.pool, ['a', 'b', 'c', 'd']);
  assert.deepEqual(before.teams[0].members, []);
});

test('the turn alternates across a full run', () => {
  let run = wheelRun();
  for (const id of ['a', 'b', 'c', 'd']) run = applyPick(run, id);
  assert.deepEqual(run.teams.map((t) => t.members), [['a', 'c'], ['b', 'd']]);
  assert.equal(isComplete(run), true);
  assert.equal(currentTeamIndex(run), null);
});

test('picking someone who is not in the pool is rejected', () => {
  assert.throws(() => applyPick(wheelRun(), 'zzz'), /not in the pool/i);
});

test('picking after the run is complete is rejected', () => {
  let run = wheelRun();
  for (const id of ['a', 'b', 'c', 'd']) run = applyPick(run, id);
  assert.throws(() => applyPick(run, 'a'), /already complete/i);
});

test('undo returns the person to their old slot on the wheel', () => {
  const start = wheelRun();
  const after = applyPick(start, 'b');
  const back = undoPick(after);
  assert.deepEqual(back.pool, ['a', 'b', 'c', 'd']);
  assert.deepEqual(back.teams[0].members, []);
  assert.equal(back.turnIndex, 0);
  assert.deepEqual(back.history, []);
});

test('undo on a run with no history is a no-op', () => {
  const run = wheelRun();
  assert.deepEqual(undoPick(run), run);
});

test('undo unwinds repeatedly back to the start', () => {
  let run = wheelRun();
  for (const id of ['a', 'b', 'c']) run = applyPick(run, id);
  for (let i = 0; i < 3; i++) run = undoPick(run);
  assert.deepEqual(run.pool, ['a', 'b', 'c', 'd']);
  assert.deepEqual(run.teams.map((t) => t.members), [[], []]);
  assert.equal(run.turnIndex, 0);
});

test('undo from a non-trivial middle index restores the exact pool order', () => {
  let run = wheelRun(['a', 'b', 'c', 'd']);
  run = applyPick(run, 'c'); // pool index 2 of [a, b, c, d]
  assert.deepEqual(run.pool, ['a', 'b', 'd']);
  run = applyPick(run, 'a'); // pool index 0 of [a, b, d]
  assert.deepEqual(run.pool, ['b', 'd']);

  run = undoPick(run);
  assert.deepEqual(run.pool, ['a', 'b', 'd']);
  assert.deepEqual(run.teams.map((t) => t.members), [['c'], []]);

  run = undoPick(run);
  assert.deepEqual(run.pool, ['a', 'b', 'c', 'd']);
  assert.deepEqual(run.teams.map((t) => t.members), [[], []]);
});

test('undo never removes a seeded captain', () => {
  const run = startRun({
    mode: 'draft', present: ['a', 'b', 'c', 'd'], teamCount: 2,
    order: [0, 1], seeded: [['a'], ['b']],
  });
  assert.deepEqual(undoPick(run).teams[0].members, ['a']);
});
