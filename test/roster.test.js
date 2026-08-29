import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName, addPerson, removePerson, renamePerson, prunePresent, findPerson, displayName,
} from '../src/roster.js';

// Deterministic ids keep the assertions readable.
function counter() {
  let n = 0;
  return () => `id${++n}`;
}

test('normalizeName trims and collapses internal whitespace', () => {
  assert.equal(normalizeName('  Nick   Wang '), 'Nick Wang');
});

test('addPerson appends a person with a generated id', () => {
  assert.deepEqual(addPerson([], 'Nick', counter()), [{ id: 'id1', name: 'Nick' }]);
});

test('addPerson stores the normalized name', () => {
  const roster = addPerson([], '  Nick   Wang  ', counter());
  assert.equal(roster[0].name, 'Nick Wang');
});

test('addPerson rejects an empty or whitespace-only name', () => {
  assert.throws(() => addPerson([], '   ', counter()), /name cannot be empty/i);
});

test('addPerson rejects a duplicate ignoring case and spacing', () => {
  const roster = addPerson([], 'Nick', counter());
  assert.throws(() => addPerson(roster, '  nIcK ', counter()), /already on the roster/i);
});

test('addPerson does not mutate the roster it was given', () => {
  const original = [];
  addPerson(original, 'Nick', counter());
  assert.deepEqual(original, []);
});

test('removePerson drops only the matching id', () => {
  const makeId = counter();
  let roster = addPerson([], 'Nick', makeId);
  roster = addPerson(roster, 'Sam', makeId);
  assert.deepEqual(removePerson(roster, 'id1'), [{ id: 'id2', name: 'Sam' }]);
});

test('removePerson leaves the roster alone when the id is unknown', () => {
  const roster = addPerson([], 'Nick', counter());
  assert.deepEqual(removePerson(roster, 'nope'), roster);
});

test('renamePerson replaces the name in place', () => {
  const roster = addPerson([], 'Nick', counter());
  assert.deepEqual(renamePerson(roster, 'id1', 'Nicholas'), [{ id: 'id1', name: 'Nicholas' }]);
});

test('renamePerson allows re-casing the same person', () => {
  const roster = addPerson([], 'Nick', counter());
  assert.deepEqual(renamePerson(roster, 'id1', 'NICK'), [{ id: 'id1', name: 'NICK' }]);
});

test('renamePerson rejects colliding with someone else', () => {
  const makeId = counter();
  let roster = addPerson([], 'Nick', makeId);
  roster = addPerson(roster, 'Sam', makeId);
  assert.throws(() => renamePerson(roster, 'id2', 'nick'), /already on the roster/i);
});

test('prunePresent drops ids that are no longer on the roster', () => {
  const roster = addPerson([], 'Nick', counter());
  assert.deepEqual(prunePresent(roster, ['id1', 'ghost']), ['id1']);
});

test('findPerson returns the person or undefined', () => {
  const roster = addPerson([], 'Nick', counter());
  assert.equal(findPerson(roster, 'id1').name, 'Nick');
  assert.equal(findPerson(roster, 'nope'), undefined);
});

test('displayName finds a name, and names the gap when it cannot', () => {
  const roster = [{ id: 'a', name: 'Andrew' }];
  assert.equal(displayName(roster, 'a'), 'Andrew');
  assert.equal(displayName(roster, 'nobody'), '(unknown)');
});
