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

test('save then load preserves configuration without persisting the roster', () => {
  const backend = fakeBackend();
  const state = {
    roster: [{ id: 'a', name: 'Nick' }],
    present: ['a'],
    config: { teamCount: 3, draftOrder: 'alternating' },
  };
  createStorage(backend).save(state);
  assert.deepEqual(JSON.parse(backend.getItem(STORAGE_KEY)), { config: state.config });
  const loaded = createStorage(backend).load();
  assert.deepEqual(loaded.roster, DEFAULT_STATE.roster);
  assert.deepEqual(loaded.present, DEFAULT_STATE.present);
  assert.deepEqual(loaded.config, state.config);
});

test('load ignores a previously saved roster and selects every current default', () => {
  const backend = fakeBackend({
    [STORAGE_KEY]: JSON.stringify({
      roster: [{ id: 'colton', name: 'Colton' }],
      present: ['colton'],
      config: { teamCount: 3, draftOrder: 'alternating' },
    }),
  });

  const loaded = createStorage(backend).load();

  assert.deepEqual(loaded.roster, DEFAULT_STATE.roster);
  assert.deepEqual(loaded.present, DEFAULT_STATE.present);
  assert.deepEqual(loaded.config, { teamCount: 3, draftOrder: 'alternating' });
});

test('corrupt stored data falls back to defaults instead of throwing', () => {
  const store = createStorage(fakeBackend({ [STORAGE_KEY]: 'not json{' }));
  assert.deepEqual(store.load(), DEFAULT_STATE);
});

test('partial stored data starts with the default roster and selection', () => {
  const store = createStorage(fakeBackend({ [STORAGE_KEY]: '{"roster":[{"id":"a","name":"Nick"}]}' }));
  const loaded = store.load();
  assert.deepEqual(loaded.roster, DEFAULT_STATE.roster);
  assert.deepEqual(loaded.present, DEFAULT_STATE.present);
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

test('an empty saved roster is replaced by the current default roster', () => {
  const store = createStorage(fakeBackend({ [STORAGE_KEY]: '{"roster":[],"present":[]}' }));
  assert.deepEqual(store.load().roster, DEFAULT_STATE.roster);
  assert.deepEqual(store.load().present, DEFAULT_STATE.present);
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
