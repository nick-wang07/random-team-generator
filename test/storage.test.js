import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, DEFAULT_STATE, STORAGE_KEY, defaultRosterState } from '../src/storage.js';

function fakeBackend(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, value); },
  };
}

test('load returns defaults when nothing is stored', () => {
  const store = createStorage(fakeBackend());
  assert.deepEqual(store.load(), DEFAULT_STATE);
});

test('save then load round-trips the state', () => {
  const backend = fakeBackend();
  const state = {
    roster: [{ id: 'a', name: 'Nick' }],
    present: ['a'],
    config: { teamCount: 3, draftOrder: 'alternating' },
  };
  createStorage(backend).save(state);
  assert.deepEqual(createStorage(backend).load(), state);
});

test('corrupt stored data falls back to defaults instead of throwing', () => {
  const store = createStorage(fakeBackend({ [STORAGE_KEY]: 'not json{' }));
  assert.deepEqual(store.load(), DEFAULT_STATE);
});

test('partial stored data is filled in with defaults', () => {
  const store = createStorage(fakeBackend({ [STORAGE_KEY]: '{"roster":[{"id":"a","name":"Nick"}]}' }));
  const loaded = store.load();
  assert.deepEqual(loaded.present, []);
  assert.deepEqual(loaded.config, { teamCount: 2, draftOrder: 'snake' });
});

test('a null backend reports unavailable but still works', () => {
  const store = createStorage(null);
  assert.equal(store.available, false);
  assert.deepEqual(store.load(), DEFAULT_STATE);
  assert.equal(store.save(DEFAULT_STATE), false);
});

test('a throwing backend does not crash load or save', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const store = createStorage(hostile);
  assert.deepEqual(store.load(), DEFAULT_STATE);
  assert.equal(store.save(DEFAULT_STATE), false);
});

test('a browser that has never saved is seeded with the regulars, all present', () => {
  const store = createStorage(fakeBackend({}));
  const loaded = store.load();
  assert.equal(loaded.roster.length, 14);
  assert.equal(loaded.roster[0].name, 'Andrew');
  assert.equal(loaded.roster.at(-1).name, 'Wyatt');
  const names = loaded.roster.map((p) => p.name);
  assert.deepEqual(names, [...names].sort(), 'the seeded roster is alphabetical');
  assert.deepEqual(loaded.present, loaded.roster.map((p) => p.id));
  assert.equal(new Set(loaded.roster.map((p) => p.id)).size, 14, 'ids are unique');
});

test('an empty roster someone cleared on purpose is not re-seeded', () => {
  const store = createStorage(fakeBackend({ [STORAGE_KEY]: '{"roster":[],"present":[]}' }));
  assert.deepEqual(store.load().roster, []);
});

test('defaultRosterState is the seed roster with everyone present', () => {
  const { roster, present } = defaultRosterState();
  assert.equal(roster.length, 14);
  assert.deepEqual(roster.map((p) => p.name), DEFAULT_STATE.roster.map((p) => p.name));
  assert.deepEqual(present, roster.map((p) => p.id));
});

test('defaultRosterState hands out a fresh copy every time', () => {
  const first = defaultRosterState();
  first.roster.push({ id: 'x', name: 'Intruder' });
  first.present.push('x');
  const second = defaultRosterState();
  assert.equal(second.roster.length, 14);
  assert.equal(second.present.length, 14);
  // and the frozen DEFAULT_STATE was never the thing being handed out
  assert.equal(DEFAULT_STATE.roster.length, 14);
});
