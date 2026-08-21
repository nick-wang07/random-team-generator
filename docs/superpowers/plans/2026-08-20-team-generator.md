# Random Team Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static GitHub Pages site that assigns a checked-off list of Discord friends into teams, either by spinning a wheel one person at a time or by tracking a captain draft.

**Architecture:** Plain ES modules served straight from the repository root — no build step, no dependencies. Pure logic modules (`roster`, `teams`, `draft`, `rng`, `run`, `storage`, `format`) never touch the DOM and are tested with Node's built-in test runner. `wheel.js` owns canvas drawing and animation but knows nothing about people or teams; `app.js` is the only file wiring DOM to logic.

**Tech Stack:** Vanilla JavaScript (ES modules), HTML5 canvas, `node --test`, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-20-team-generator-design.md`

## Global Constraints

- **No runtime dependencies.** `package.json` must never gain a `dependencies` field. Dev dependencies are not needed either — tests use Node's built-in runner.
- **Node 20 or newer** (for a stable `node --test` and `crypto.randomUUID`).
- **`"type": "module"`** in `package.json` so the same `.js` files load in both Node and the browser.
- **DOM isolation:** every module in `src/` except `wheel.js` and `app.js` must not reference `document`, `window`, `localStorage`, or `canvas`. This is what keeps them testable without jsdom.
- **Storage key is `rtg.v1`.** Bump the suffix only if the persisted shape changes incompatibly.
- **Team count range is 2 to 8**, defaulting to 2.
- **Team labels are `Team A` through `Team H`.** Renaming teams is out of scope.
- **Names** are trimmed, internal whitespace collapsed to single spaces, and compared case-insensitively for duplicates.
- **Dark theme, large type.** The app is viewed through a Discord screen share; assume a desktop window, not a phone.
- **Commit after every task.** Conventional-commit prefixes (`feat:`, `test:`, `chore:`, `fix:`).

### Deviation from the spec

The spec's module list does not include `src/run.js`. This plan adds it. The
spec's data model puts `run` state (pool, turn index, history, undo) in the app,
but leaving that in `app.js` would make undo and turn rotation untestable. `run.js`
is a pure state machine that both modes share; `app.js` stays a thin controller.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | Module type and test script. No dependencies. |
| `index.html` | Single page holding all three views. |
| `styles.css` | Dark theme, layout, wheel and board styling. |
| `src/storage.js` | localStorage read/write, versioned key, safe fallback. |
| `src/roster.js` | Pure roster operations: add, remove, rename, prune, normalize. |
| `src/teams.js` | Pure: team sizes, pick rotation, labels, setup validation. |
| `src/rng.js` | Pure randomness with an injectable source, plus spin planning. |
| `src/run.js` | Pure run state machine shared by both modes, including undo. |
| `src/draft.js` | Pure: snake and alternating pick sequences. |
| `src/format.js` | Pure: render finished teams as plain text for Discord. |
| `src/wheel.js` | Canvas: draw slices, animate to a given stop angle. |
| `src/app.js` | Controller. The only file that touches both DOM and logic. |
| `test/*.test.js` | One test file per pure module. |
| `docs/MANUAL-CHECKS.md` | Manual verification checklist for canvas and DOM work. |

---

## Task 1: Scaffold and persistence

**Files:**
- Create: `package.json`
- Create: `src/storage.js`
- Test: `test/storage.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `STORAGE_KEY: string`, `DEFAULT_STATE: {roster: [], present: [], config: {teamCount: number, draftOrder: 'snake'|'alternating'}}`, `browserBackend(): Storage|null`, `createStorage(backend): {available: boolean, load(): State, save(state): boolean}`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "random-team-generator",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `test/storage.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, DEFAULT_STATE, STORAGE_KEY } from '../src/storage.js';

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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/storage.js`

- [ ] **Step 4: Write the implementation**

Create `src/storage.js`:

```js
export const STORAGE_KEY = 'rtg.v1';

export const DEFAULT_STATE = Object.freeze({
  roster: [],
  present: [],
  config: { teamCount: 2, draftOrder: 'snake' },
});

function defaults() {
  return { roster: [], present: [], config: { teamCount: 2, draftOrder: 'snake' } };
}

// Returns localStorage when it is usable, or null in a private window where
// touching it throws. Callers use the null to show a "nothing will be saved" notice.
export function browserBackend() {
  try {
    const probe = '__rtg_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function createStorage(backend) {
  return {
    available: Boolean(backend),

    load() {
      if (!backend) return defaults();
      let raw;
      try {
        raw = backend.getItem(STORAGE_KEY);
      } catch {
        return defaults();
      }
      if (!raw) return defaults();
      try {
        const parsed = JSON.parse(raw);
        const config = parsed && parsed.config ? parsed.config : {};
        return {
          roster: Array.isArray(parsed.roster) ? parsed.roster : [],
          present: Array.isArray(parsed.present) ? parsed.present : [],
          config: {
            teamCount: Number.isInteger(config.teamCount) ? config.teamCount : 2,
            draftOrder: config.draftOrder === 'alternating' ? 'alternating' : 'snake',
          },
        };
      } catch {
        return defaults();
      }
    },

    save(state) {
      if (!backend) return false;
      try {
        backend.setItem(STORAGE_KEY, JSON.stringify({
          roster: state.roster,
          present: state.present,
          config: state.config,
        }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 6 tests passing.

- [ ] **Step 6: Commit**

```bash
git add package.json src/storage.js test/storage.test.js
git commit -m "feat: add versioned localStorage persistence with safe fallback"
```

---

## Task 2: Roster operations

**Files:**
- Create: `src/roster.js`
- Test: `test/roster.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeName(name): string`, `addPerson(roster, name, makeId?): Person[]`, `removePerson(roster, id): Person[]`, `renamePerson(roster, id, name): Person[]`, `prunePresent(roster, present): string[]`, `findPerson(roster, id): Person|undefined`. `Person` is `{ id: string, name: string }`. All operations return new arrays and never mutate their input. `addPerson` and `renamePerson` throw `Error` on invalid input.

- [ ] **Step 1: Write the failing test**

Create `test/roster.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName, addPerson, removePerson, renamePerson, prunePresent, findPerson,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/roster.js`

- [ ] **Step 3: Write the implementation**

Create `src/roster.js`:

```js
function defaultMakeId() {
  return crypto.randomUUID();
}

export function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function matchKey(name) {
  return normalizeName(name).toLowerCase();
}

function assertUsable(roster, name, exceptId = null) {
  const clean = normalizeName(name);
  if (clean === '') throw new Error('Name cannot be empty');
  const key = matchKey(clean);
  const clash = roster.some((p) => p.id !== exceptId && matchKey(p.name) === key);
  if (clash) throw new Error(`"${clean}" is already on the roster`);
  return clean;
}

export function addPerson(roster, name, makeId = defaultMakeId) {
  const clean = assertUsable(roster, name);
  return [...roster, { id: makeId(), name: clean }];
}

export function removePerson(roster, id) {
  return roster.filter((p) => p.id !== id);
}

export function renamePerson(roster, id, name) {
  const clean = assertUsable(roster, name, id);
  return roster.map((p) => (p.id === id ? { ...p, name: clean } : p));
}

export function prunePresent(roster, present) {
  const ids = new Set(roster.map((p) => p.id));
  return present.filter((id) => ids.has(id));
}

export function findPerson(roster, id) {
  return roster.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 13 roster tests plus the 6 from Task 1.

- [ ] **Step 5: Commit**

```bash
git add src/roster.js test/roster.test.js
git commit -m "feat: add pure roster operations with dedupe and validation"
```

---

## Task 3: Team sizing, rotation, and setup validation

**Files:**
- Create: `src/teams.js`
- Test: `test/teams.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `MIN_TEAMS = 2`, `MAX_TEAMS = 8`, `teamSizes(n, k): number[]`, `pickRotation(n, k): number[]` (one team index per pick, length `n`), `teamLabel(i): string`, `createTeams(k): {name: string, members: string[]}[]`, `validateSetup({presentCount, teamCount}): {ok: true} | {ok: false, reason: string}`.

- [ ] **Step 1: Write the failing test**

Create `test/teams.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  teamSizes, pickRotation, teamLabel, createTeams, validateSetup, MAX_TEAMS,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/teams.js`

- [ ] **Step 3: Write the implementation**

Create `src/teams.js`:

```js
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;

// Everyone gets floor(n / k); the first n % k teams get one extra.
export function teamSizes(n, k) {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// A, B, A, B, ... fills exactly the sizes above, because the remainder is
// front-loaded onto the same teams the rotation reaches first.
export function pickRotation(n, k) {
  return Array.from({ length: n }, (_, i) => i % k);
}

export function teamLabel(index) {
  return `Team ${String.fromCharCode(65 + index)}`;
}

export function createTeams(k) {
  return Array.from({ length: k }, (_, i) => ({ name: teamLabel(i), members: [] }));
}

export function validateSetup({ presentCount, teamCount }) {
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAMS || teamCount > MAX_TEAMS) {
    return { ok: false, reason: `Teams must be between ${MIN_TEAMS} and ${MAX_TEAMS}` };
  }
  if (presentCount < 2) {
    return { ok: false, reason: 'Need at least 2 people' };
  }
  if (presentCount < teamCount) {
    return { ok: false, reason: `Need at least ${teamCount} people for ${teamCount} teams` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 10 new tests, none failing.

- [ ] **Step 5: Commit**

```bash
git add src/teams.js test/teams.test.js
git commit -m "feat: add team sizing, pick rotation, and setup validation"
```

---

## Task 4: Setup view, live on GitHub Pages

This is the first task with a screen. It ends with a real URL you can open.

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/app.js`
- Create: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: `createStorage`, `browserBackend` (Task 1); `addPerson`, `removePerson`, `renamePerson`, `prunePresent` (Task 2); `validateSetup` (Task 3).
- Produces: the DOM contract later tasks bind to — element ids `setup-view`, `run-view`, `results-view`, `roster-list`, `name-input`, `add-form`, `team-count`, `start-wheel-btn`, `start-draft-btn`, `setup-error`, `storage-notice`. A module-level `state` object `{ roster, present, config, run }` and a `render()` function that redraws the active view.

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Team Generator</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main>
    <section id="setup-view" class="view">
      <h1>Team Generator</h1>
      <p id="storage-notice" class="notice" hidden>
        Saving is turned off in this browser, so your roster will not survive a refresh.
      </p>

      <div class="roster-panel">
        <h2>Who is in the call?</h2>
        <ul id="roster-list" class="roster-list"></ul>
        <form id="add-form" class="add-form">
          <input id="name-input" type="text" placeholder="Add a name" autocomplete="off">
          <button id="add-btn" type="submit">Add</button>
        </form>
      </div>

      <div class="config-panel">
        <label for="team-count">Teams</label>
        <input id="team-count" type="number" min="2" max="8" value="2">
        <p id="setup-error" class="error" hidden></p>
        <div class="start-buttons">
          <button id="start-wheel-btn" type="button">Spin the wheel</button>
          <button id="start-draft-btn" type="button">Captain draft</button>
        </div>
      </div>
    </section>

    <section id="run-view" class="view" hidden></section>
    <section id="results-view" class="view" hidden></section>
  </main>
  <script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `styles.css`**

Dark, high contrast, sized for a screen share. The wheel gets its own rules in Task 8.

```css
:root {
  --bg: #14161c;
  --panel: #1e212b;
  --line: #2f3442;
  --text: #f2f4f8;
  --muted: #9aa3b5;
  --accent: #6ea8ff;
  --danger: #ff6b6b;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 18px/1.5 system-ui, sans-serif;
}

main { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; }
h1 { font-size: 40px; margin: 0 0 24px; }
h2 { font-size: 22px; margin: 0 0 12px; }
.view[hidden] { display: none; }

.roster-panel, .config-panel {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
}

.roster-list { list-style: none; margin: 0 0 16px; padding: 0; }
.roster-list li {
  display: flex; align-items: center; gap: 12px;
  padding: 8px 4px; border-bottom: 1px solid var(--line);
}
.roster-list input[type="checkbox"] { width: 22px; height: 22px; accent-color: var(--accent); }
.roster-list .name { flex: 1; font-size: 20px; }
.roster-list button { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 16px; }
.roster-list button:hover { color: var(--danger); }
.empty { color: var(--muted); font-style: italic; }

.add-form { display: flex; gap: 8px; }
input[type="text"], input[type="number"] {
  background: var(--bg); color: var(--text);
  border: 1px solid var(--line); border-radius: 8px;
  padding: 10px 12px; font-size: 18px;
}
input[type="text"] { flex: 1; }
input[type="number"] { width: 90px; }

button {
  background: var(--accent); color: #10131a; border: none;
  border-radius: 8px; padding: 10px 18px;
  font-size: 18px; font-weight: 600; cursor: pointer;
}
button:disabled { opacity: 0.45; cursor: not-allowed; }

.start-buttons { display: flex; gap: 12px; margin-top: 16px; }
.error { color: var(--danger); margin: 12px 0 0; }
.notice { color: var(--muted); margin: 0 0 20px; }
```

- [ ] **Step 3: Write `src/app.js`**

```js
import { browserBackend, createStorage } from './storage.js';
import { addPerson, removePerson, renamePerson, prunePresent } from './roster.js';
import { validateSetup } from './teams.js';

const store = createStorage(browserBackend());
const loaded = store.load();

export const state = {
  roster: loaded.roster,
  present: prunePresent(loaded.roster, loaded.present),
  config: loaded.config,
  run: null,
};

const el = (id) => document.getElementById(id);

function persist() {
  store.save({ roster: state.roster, present: state.present, config: state.config });
}

function showError(message) {
  const box = el('setup-error');
  box.textContent = message;
  box.hidden = !message;
}

function togglePresent(id, isPresent) {
  state.present = isPresent
    ? [...new Set([...state.present, id])]
    : state.present.filter((x) => x !== id);
  persist();
  render();
}

function rosterRow(person) {
  const li = document.createElement('li');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.present.includes(person.id);
  box.addEventListener('change', () => togglePresent(person.id, box.checked));

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = person.name;

  const rename = document.createElement('button');
  rename.type = 'button';
  rename.textContent = 'rename';
  rename.addEventListener('click', () => {
    const next = window.prompt('New name', person.name);
    if (next === null) return;
    try {
      state.roster = renamePerson(state.roster, person.id, next);
      persist();
      render();
    } catch (err) {
      showError(err.message);
    }
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'remove';
  remove.addEventListener('click', () => {
    state.roster = removePerson(state.roster, person.id);
    state.present = prunePresent(state.roster, state.present);
    persist();
    render();
  });

  li.append(box, name, rename, remove);
  return li;
}

function renderRoster() {
  const list = el('roster-list');
  list.replaceChildren();
  if (state.roster.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No one yet — add your friends below.';
    list.append(li);
    return;
  }
  list.append(...state.roster.map(rosterRow));
}

function renderSetup() {
  renderRoster();
  el('team-count').value = String(state.config.teamCount);
  const check = validateSetup({
    presentCount: state.present.length,
    teamCount: state.config.teamCount,
  });
  showError(check.ok ? '' : check.reason);
  el('start-wheel-btn').disabled = !check.ok;
  el('start-draft-btn').disabled = !check.ok;
}

export function render() {
  if (!state.run) {
    el('setup-view').hidden = false;
    el('run-view').hidden = true;
    el('results-view').hidden = true;
    renderSetup();
  }
}

el('storage-notice').hidden = store.available;

el('add-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = el('name-input');
  try {
    state.roster = addPerson(state.roster, input.value);
    input.value = '';
    showError('');
    persist();
    render();
  } catch (err) {
    showError(err.message);
  }
});

el('team-count').addEventListener('input', () => {
  state.config.teamCount = Number(el('team-count').value);
  persist();
  render();
});

render();
```

The start buttons deliberately have no handlers yet — Task 7 wires them.

- [ ] **Step 4: Verify by hand**

Serve the folder (`npx --yes http-server -p 8080 .` or `python -m http.server 8080`),
open `http://localhost:8080`, and confirm each of these:

1. Adding a name puts it in the list and clears the input.
2. Adding the same name in different case shows "already on the roster".
3. Adding only whitespace shows "Name cannot be empty".
4. Rename works; cancelling the prompt changes nothing.
5. Removing a checked person leaves no ghost check-off behind.
6. Two people checked with Teams at 2 enables both start buttons.
7. Teams at 3 with two people checked disables them and reads
   "Need at least 3 people for 3 teams".
8. Refreshing restores the roster, the check-offs, and the team count.

- [ ] **Step 5: Record the checklist**

Create `docs/MANUAL-CHECKS.md` starting with a `# Manual checks` heading and a
`## Setup view` section listing the eight checks above as `- [ ]` items. Later
tasks append their own sections to this file.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/app.js docs/MANUAL-CHECKS.md
git commit -m "feat: add setup view with persistent roster and check-offs"
```

- [ ] **Step 7: Publish to GitHub Pages**

Create the GitHub repository, push `main`, then in **Settings > Pages** set the
source to **Deploy from a branch**, branch `main`, folder `/ (root)`. Wait for
the first deploy, open the live URL, and confirm the page loads and the roster
persists there too.

---

## Task 5: Randomness and spin planning

The whole fairness story lives here. The winner is drawn *before* the animation,
and the exact stop angle is computed from an injectable source so a test can pin it.

**Files:**
- Create: `src/rng.js`
- Test: `test/rng.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `randomInt(maxExclusive, source?): number`, `randomIndex(array, source?): number`, `SLICE_PAD = 0.1`, `MIN_FULL_SPINS = 4`, `MAX_FULL_SPINS = 6`, `planSpin(sliceCount, winnerIndex, source?): {sliceAngle, targetLocalDeg, fullSpins, stopAngleDeg}`. `source` defaults to `Math.random` and is called exactly twice by `planSpin`: first for the position inside the slice, then for the number of full spins.

**Geometry contract:** the pointer sits at the top of the wheel. At rotation 0,
slice `i` occupies local angles `[i * sliceAngle, (i + 1) * sliceAngle)` measured
clockwise from the pointer. Rotating the wheel clockwise by `R` puts local angle
`(360 - R % 360) % 360` under the pointer.

- [ ] **Step 1: Write the failing test**

Create `test/rng.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomIndex, planSpin, SLICE_PAD } from '../src/rng.js';

// A source that hands back fixed values in order, so every draw is pinned.
function sequence(values) {
  let i = 0;
  return () => values[i++];
}

// Which local angle ends up under the pointer for a given total rotation.
function underPointer(stopAngleDeg) {
  return (360 - (stopAngleDeg % 360)) % 360;
}

test('randomInt maps the source onto 0..max-1', () => {
  assert.equal(randomInt(4, () => 0), 0);
  assert.equal(randomInt(4, () => 0.5), 2);
  assert.equal(randomInt(4, () => 0.999), 3);
});

test('randomIndex stays within the array bounds', () => {
  assert.equal(randomIndex(['a', 'b', 'c'], () => 0), 0);
  assert.equal(randomIndex(['a', 'b', 'c'], () => 0.999), 2);
});

test('planSpin computes an exact stop angle', () => {
  // 4 slices of 90 degrees. Winner is slice 1, fraction 0.5, so the target is
  // 90 * (1 + 0.1 + 0.8 * 0.5) = 135 degrees, and 4 full spins are added.
  const plan = planSpin(4, 1, sequence([0.5, 0]));
  assert.equal(plan.sliceAngle, 90);
  assert.equal(plan.targetLocalDeg, 135);
  assert.equal(plan.fullSpins, 4);
  assert.equal(plan.stopAngleDeg, 1440 + 225);
});

test('the pointer always lands inside the winning slice, never on a divider', () => {
  const sliceCount = 12;
  const sliceAngle = 360 / sliceCount;
  for (const fraction of [0, 0.25, 0.5, 0.75, 0.999]) {
    for (let winner = 0; winner < sliceCount; winner++) {
      const { stopAngleDeg } = planSpin(sliceCount, winner, sequence([fraction, 0]));
      const local = underPointer(stopAngleDeg);
      assert.equal(Math.floor(local / sliceAngle), winner, `winner ${winner} at ${fraction}`);
      const offsetInSlice = local - winner * sliceAngle;
      assert.ok(offsetInSlice >= sliceAngle * SLICE_PAD - 1e-9, 'too close to the leading edge');
      assert.ok(offsetInSlice <= sliceAngle * (1 - SLICE_PAD) + 1e-9, 'too close to the trailing edge');
    }
  }
});

test('the same winner lands somewhere different each spin', () => {
  const a = planSpin(6, 2, sequence([0.1, 0]));
  const b = planSpin(6, 2, sequence([0.9, 0]));
  assert.notEqual(a.stopAngleDeg, b.stopAngleDeg);
});

test('full spins stay between 4 and 6', () => {
  assert.equal(planSpin(6, 0, sequence([0, 0])).fullSpins, 4);
  assert.equal(planSpin(6, 0, sequence([0, 0.5])).fullSpins, 5);
  assert.equal(planSpin(6, 0, sequence([0, 0.999])).fullSpins, 6);
});

test('a single slice still produces a valid spin', () => {
  const { stopAngleDeg } = planSpin(1, 0, sequence([0.5, 0]));
  assert.ok(Number.isFinite(stopAngleDeg));
  assert.equal(Math.floor(underPointer(stopAngleDeg) / 360), 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/rng.js`

- [ ] **Step 3: Write the implementation**

Create `src/rng.js`:

```js
export const SLICE_PAD = 0.1;
export const MIN_FULL_SPINS = 4;
export const MAX_FULL_SPINS = 6;

export function randomInt(maxExclusive, source = Math.random) {
  return Math.floor(source() * maxExclusive);
}

export function randomIndex(array, source = Math.random) {
  return randomInt(array.length, source);
}

// Draws twice: where inside the winning slice to stop, then how many full
// spins to add. The winner itself is chosen by the caller before this runs.
export function planSpin(sliceCount, winnerIndex, source = Math.random) {
  const sliceAngle = 360 / sliceCount;
  const fraction = source();
  const usableSpan = 1 - SLICE_PAD * 2;
  const targetLocalDeg = sliceAngle * (winnerIndex + SLICE_PAD + usableSpan * fraction);
  const fullSpins = MIN_FULL_SPINS + randomInt(MAX_FULL_SPINS - MIN_FULL_SPINS + 1, source);
  const stopAngleDeg = fullSpins * 360 + ((360 - (targetLocalDeg % 360)) % 360);
  return { sliceAngle, targetLocalDeg, fullSpins, stopAngleDeg };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 7 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/rng.js test/rng.test.js
git commit -m "feat: add injectable randomness and exact spin planning"
```

---

## Task 6: The shared run state machine

Both modes produce picks; only the chooser differs. This module holds the pool,
whose turn it is, and the history that makes undo possible. It is pure — every
operation returns a new run object.

**Files:**
- Create: `src/run.js`
- Test: `test/run.test.js`

**Interfaces:**
- Consumes: `createTeams` (Task 3).
- Produces: `startRun({mode, present, teamCount, order, seeded?}): Run`, `currentTeamIndex(run): number|null`, `applyPick(run, personId): Run`, `undoPick(run): Run`, `isComplete(run): boolean`, `picksRemaining(run): number`. `Run` is `{ mode, teams: [{name, members: string[]}], pool: string[], order: number[], turnIndex: number, history: [{personId, teamIndex, poolIndex}] }`. `seeded` is an array of arrays of person ids, one per team, placed before the run starts (used for draft captains) and removed from the pool.

- [ ] **Step 1: Write the failing test**

Create `test/run.test.js`:

```js
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

test('undo never removes a seeded captain', () => {
  const run = startRun({
    mode: 'draft', present: ['a', 'b', 'c', 'd'], teamCount: 2,
    order: [0, 1], seeded: [['a'], ['b']],
  });
  assert.deepEqual(undoPick(run).teams[0].members, ['a']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/run.js`

- [ ] **Step 3: Write the implementation**

Create `src/run.js`:

```js
import { createTeams } from './teams.js';

export function startRun({ mode, present, teamCount, order, seeded = [] }) {
  const teams = createTeams(teamCount).map((team, i) => ({
    ...team,
    members: [...(seeded[i] ?? [])],
  }));
  const taken = new Set(seeded.flat());
  return {
    mode,
    teams,
    pool: present.filter((id) => !taken.has(id)),
    order,
    turnIndex: 0,
    history: [],
  };
}

export function isComplete(run) {
  return run.turnIndex >= run.order.length || run.pool.length === 0;
}

export function currentTeamIndex(run) {
  return isComplete(run) ? null : run.order[run.turnIndex];
}

export function picksRemaining(run) {
  return Math.min(run.order.length - run.turnIndex, run.pool.length);
}

export function applyPick(run, personId) {
  if (isComplete(run)) throw new Error('Run is already complete');
  const poolIndex = run.pool.indexOf(personId);
  if (poolIndex === -1) throw new Error(`${personId} is not in the pool`);

  const teamIndex = run.order[run.turnIndex];
  return {
    ...run,
    teams: run.teams.map((team, i) => (
      i === teamIndex ? { ...team, members: [...team.members, personId] } : team
    )),
    pool: run.pool.filter((id) => id !== personId),
    turnIndex: run.turnIndex + 1,
    history: [...run.history, { personId, teamIndex, poolIndex }],
  };
}

// Puts the person back at the pool position they left from, so the wheel
// does not reshuffle itself when someone undoes a spin.
export function undoPick(run) {
  if (run.history.length === 0) return run;
  const last = run.history[run.history.length - 1];
  const pool = [...run.pool];
  pool.splice(last.poolIndex, 0, last.personId);
  return {
    ...run,
    teams: run.teams.map((team, i) => (
      i === last.teamIndex
        ? { ...team, members: team.members.filter((id) => id !== last.personId) }
        : team
    )),
    pool,
    turnIndex: run.turnIndex - 1,
    history: run.history.slice(0, -1),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 11 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/run.js test/run.test.js
git commit -m "feat: add shared run state machine with undo"
```

---

## Task 7: Headless assignment and the results view

End of the "correct but ugly" phase: real teams get generated by a plain button,
and the results screen is the one both modes will finish on.

**Files:**
- Create: `src/format.js`
- Test: `test/format.test.js`
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: `randomIndex` (Task 5); `startRun`, `applyPick`, `currentTeamIndex`, `isComplete`, `picksRemaining` (Task 6); `pickRotation`, `teamLabel` (Task 3); `findPerson` (Task 2).
- Produces: `formatTeams(teams, roster): string`. In `app.js`: `startWheelRun()`, `renderRun()`, `renderResults()`, `teamColumns(teams): HTMLElement`, `nameOf(id): string`.

- [ ] **Step 1: Write the failing test for the Discord text**

Create `test/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTeams } from '../src/format.js';

const roster = [
  { id: 'a', name: 'Nick' },
  { id: 'b', name: 'Sam' },
  { id: 'c', name: 'Ali' },
];

test('formats each team as a heading with its members listed below', () => {
  const teams = [
    { name: 'Team A', members: ['a', 'c'] },
    { name: 'Team B', members: ['b'] },
  ];
  assert.equal(formatTeams(teams, roster), [
    '**Team A**',
    '- Nick',
    '- Ali',
    '',
    '**Team B**',
    '- Sam',
  ].join('\n'));
});

test('an empty team still gets a heading', () => {
  assert.equal(formatTeams([{ name: 'Team A', members: [] }], roster), '**Team A**');
});

test('an unknown id falls back to a placeholder rather than crashing', () => {
  const teams = [{ name: 'Team A', members: ['ghost'] }];
  assert.equal(formatTeams(teams, roster), '**Team A**\n- (unknown)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/format.js`

- [ ] **Step 3: Write `src/format.js`**

```js
import { findPerson } from './roster.js';

export function formatTeams(teams, roster) {
  return teams
    .map((team) => [
      `**${team.name}**`,
      ...team.members.map((id) => `- ${findPerson(roster, id)?.name ?? '(unknown)'}`),
    ].join('\n'))
    .join('\n\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 3 new tests.

- [ ] **Step 5: Extend the imports in `src/app.js`**

```js
import { addPerson, removePerson, renamePerson, prunePresent, findPerson } from './roster.js';
import { validateSetup, pickRotation, teamLabel } from './teams.js';
import { randomIndex } from './rng.js';
import { startRun, applyPick, currentTeamIndex, isComplete, picksRemaining } from './run.js';
import { formatTeams } from './format.js';
```

- [ ] **Step 6: Add the run and results views to `src/app.js`**

Add these functions above `render()`:

```js
function nameOf(id) {
  return findPerson(state.roster, id)?.name ?? '(unknown)';
}

function startWheelRun() {
  const present = [...state.present];
  state.run = startRun({
    mode: 'wheel',
    present,
    teamCount: state.config.teamCount,
    order: pickRotation(present.length, state.config.teamCount),
  });
  render();
}

function spinOnce() {
  const winner = state.run.pool[randomIndex(state.run.pool)];
  state.run = applyPick(state.run, winner);
  render();
}

function teamColumns(teams) {
  const wrap = document.createElement('div');
  wrap.className = 'team-columns';
  for (const team of teams) {
    const col = document.createElement('div');
    col.className = 'team-column';

    const heading = document.createElement('h3');
    heading.textContent = `${team.name} (${team.members.length})`;

    const list = document.createElement('ul');
    list.append(...team.members.map((id) => {
      const li = document.createElement('li');
      li.textContent = nameOf(id);
      return li;
    }));

    col.append(heading, list);
    wrap.append(col);
  }
  return wrap;
}

function renderRun() {
  const view = el('run-view');
  view.replaceChildren();

  const heading = document.createElement('h2');
  heading.className = 'turn-heading';
  heading.textContent = `Spinning for ${teamLabel(currentTeamIndex(state.run))}`;

  const pool = document.createElement('p');
  pool.className = 'pool-line';
  pool.textContent = state.run.pool.map(nameOf).join(' · ');

  const pick = document.createElement('button');
  pick.type = 'button';
  pick.textContent = `Pick next (${picksRemaining(state.run)} left)`;
  pick.addEventListener('click', spinOnce);

  view.append(heading, pool, pick, teamColumns(state.run.teams));
}

function renderResults() {
  const view = el('results-view');
  view.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = 'Teams';

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy for Discord';
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(formatTeams(state.run.teams, state.roster));
    copy.textContent = 'Copied';
    setTimeout(() => { copy.textContent = 'Copy for Discord'; }, 1500);
  });

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'secondary';
  again.textContent = 'Back to setup';
  again.addEventListener('click', () => { state.run = null; render(); });

  const actions = document.createElement('div');
  actions.className = 'start-buttons';
  actions.append(copy, again);

  view.append(heading, teamColumns(state.run.teams), actions);
}
```

Replace `render()` with the three-way version:

```js
export function render() {
  const running = Boolean(state.run);
  const finished = running && isComplete(state.run);
  el('setup-view').hidden = running;
  el('run-view').hidden = !running || finished;
  el('results-view').hidden = !finished;

  if (!running) renderSetup();
  else if (finished) renderResults();
  else renderRun();
}
```

Wire the wheel start button alongside the existing listeners:

```js
el('start-wheel-btn').addEventListener('click', startWheelRun);
```

- [ ] **Step 7: Add the team column styles to `styles.css`**

```css
.turn-heading { font-size: 32px; margin: 0 0 8px; }
.pool-line { color: var(--muted); margin: 0 0 20px; }
.team-columns { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 28px; }
.team-column {
  flex: 1 1 220px; background: var(--panel);
  border: 1px solid var(--line); border-radius: 12px; padding: 16px;
}
.team-column h3 { margin: 0 0 12px; font-size: 22px; color: var(--accent); }
.team-column ul { list-style: none; margin: 0; padding: 0; }
.team-column li { font-size: 24px; padding: 6px 0; }
button.secondary { background: var(--line); color: var(--text); }
```

- [ ] **Step 8: Verify by hand**

With six people checked and Teams at 2:

1. "Spin the wheel" hides setup and shows the run view.
2. The heading reads "Spinning for Team A" before the first pick.
3. Each "Pick next" click moves one name into a team and flips the heading to the other team.
4. The count in the button ticks down to zero.
5. Nobody is assigned twice and nobody is left out.
6. The results view appears after the last pick, with teams of 3 and 3.
7. With five people the split is 3 and 2, and Team A gets the extra person.
8. "Copy for Discord" puts readable text on the clipboard.
9. "Back to setup" returns to the roster with the check-offs intact.

Append these as a `## Wheel run and results` section in `docs/MANUAL-CHECKS.md`.

- [ ] **Step 9: Commit**

```bash
git add src/format.js test/format.test.js src/app.js styles.css docs/MANUAL-CHECKS.md
git commit -m "feat: assign teams headlessly and show the results view"
```

---

## Task 8: Draw the wheel

Canvas rendering only — no animation yet. The "Pick next" button stays; the wheel
just shows who is still in the pool. Verified by eye, per the spec.

**Files:**
- Create: `src/wheel.js`
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Modify: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: nothing from other modules. `wheel.js` knows about slices and angles, never about people or teams.
- Produces: `createWheel(canvas): {setSlices(labels: string[]): void, setRotation(deg: number): void, draw(): void, resize(): void, getRotation(): number}`. Task 9 adds `spinTo` to this same object.

**Geometry contract** (must match `planSpin` from Task 5): the pointer is at the
top. At rotation 0, slice `i` covers local angles `[i * sliceAngle, (i + 1) * sliceAngle)`
clockwise from the pointer. Canvas angles start at 3 o'clock and run clockwise, so
drawing slice `i` means starting at `(rotation + i * sliceAngle) - 90` degrees.

- [ ] **Step 1: Add the canvas to `index.html`**

Replace the empty run view with:

```html
<section id="run-view" class="view" hidden>
  <h2 id="turn-heading" class="turn-heading"></h2>
  <div class="wheel-wrap">
    <canvas id="wheel-canvas" width="600" height="600"></canvas>
  </div>
  <div id="run-controls" class="start-buttons"></div>
  <div id="run-teams"></div>
</section>
```

- [ ] **Step 2: Write `src/wheel.js`**

```js
const TAU = Math.PI * 2;
const toRad = (deg) => (deg * Math.PI) / 180;

// Evenly spaced hues keep neighbouring slices distinguishable at any count.
function sliceColor(index, total) {
  const hue = Math.round((360 / Math.max(total, 1)) * index);
  return `hsl(${hue} 62% 46%)`;
}

export function createWheel(canvas) {
  const ctx = canvas.getContext('2d');
  let labels = [];
  let rotation = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth || 600;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawPointer(cx, radius) {
    ctx.save();
    ctx.fillStyle = '#f2f4f8';
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx - 16, 8 - 22);
    ctx.lineTo(cx + 16, 8 - 22);
    ctx.closePath();
    ctx.fill();
    // A second triangle pointing down into the wheel makes the tip unambiguous.
    ctx.beginPath();
    ctx.moveTo(cx, 8 + 26);
    ctx.lineTo(cx - 16, 8);
    ctx.lineTo(cx + 16, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.width / dpr;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 30;

    ctx.clearRect(0, 0, size, size);

    if (labels.length === 0) {
      drawPointer(cx, radius);
      return;
    }

    const sliceAngle = 360 / labels.length;

    labels.forEach((label, i) => {
      const start = toRad(rotation + i * sliceAngle - 90);
      const end = toRad(rotation + (i + 1) * sliceAngle - 90);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = sliceColor(i, labels.length);
      ctx.fill();
      ctx.strokeStyle = '#14161c';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text runs along the middle of the slice, reading outward.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(toRad(rotation + (i + 0.5) * sliceAngle - 90));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f1116';
      ctx.font = `600 ${Math.max(14, Math.min(28, 520 / labels.length))}px system-ui, sans-serif`;
      ctx.fillText(label, radius - 16, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, TAU);
    ctx.fillStyle = '#1e212b';
    ctx.fill();
    ctx.strokeStyle = '#2f3442';
    ctx.lineWidth = 3;
    ctx.stroke();

    drawPointer(cx, radius);
  }

  return {
    setSlices(next) { labels = [...next]; },
    setRotation(deg) { rotation = deg; },
    getRotation() { return rotation; },
    resize,
    draw,
  };
}
```

- [ ] **Step 3: Style the wheel in `styles.css`**

```css
.wheel-wrap { display: flex; justify-content: center; margin: 12px 0 24px; }
#wheel-canvas { width: min(600px, 80vw); height: auto; aspect-ratio: 1; }
```

- [ ] **Step 4: Show the wheel in `src/app.js`**

Import it and create it once:

```js
import { createWheel } from './wheel.js';

const wheel = createWheel(el('wheel-canvas'));
window.addEventListener('resize', () => { wheel.resize(); wheel.draw(); });
```

Rewrite `renderRun()` to target the static markup instead of rebuilding it:

```js
function renderRun() {
  el('turn-heading').textContent = `Spinning for ${teamLabel(currentTeamIndex(state.run))}`;

  wheel.setSlices(state.run.pool.map(nameOf));
  wheel.resize();
  wheel.draw();

  const controls = el('run-controls');
  controls.replaceChildren();
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.textContent = `Pick next (${picksRemaining(state.run)} left)`;
  pick.addEventListener('click', spinOnce);
  controls.append(pick);

  const teams = el('run-teams');
  teams.replaceChildren(teamColumns(state.run.teams));
}
```

- [ ] **Step 5: Verify by hand**

1. Starting a run shows a full wheel with one slice per person in the pool.
2. Every name is readable and no two neighbouring slices share a colour.
3. The pointer is clearly at the top.
4. Clicking "Pick next" removes that person's slice and the wheel redraws evenly.
5. With twelve names the text still fits inside the slices.
6. Resizing the window keeps the wheel crisp, not blurry or stretched.

Append as a `## Wheel drawing` section in `docs/MANUAL-CHECKS.md`.

- [ ] **Step 6: Commit**

```bash
git add src/wheel.js index.html styles.css src/app.js docs/MANUAL-CHECKS.md
git commit -m "feat: draw the pool as a canvas wheel"
```

---

## Task 9: Spin the wheel for real

The winner is still drawn by `randomIndex` before anything moves; the animation
only travels to the angle `planSpin` computed.

**Files:**
- Modify: `src/wheel.js`
- Modify: `src/app.js`
- Modify: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: `planSpin`, `randomIndex` (Task 5).
- Produces: `spinTo(stopAngleDeg, durationMs?): Promise<void>` added to the object returned by `createWheel`, plus `isSpinning(): boolean`.

- [ ] **Step 1: Add the animation to `src/wheel.js`**

Add above the `return`:

```js
const SPIN_MS = 4000;
let spinning = false;

// Cubic ease-out: fast off the line, creeping into the final degree.
function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function spinTo(stopAngleDeg, durationMs = SPIN_MS) {
  const from = rotation;
  const distance = stopAngleDeg - from;
  spinning = true;
  return new Promise((resolve) => {
    const started = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - started) / durationMs);
      rotation = from + distance * easeOut(t);
      draw();
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        // Normalise so the next spin's 4-to-6 turns start from a small angle.
        rotation = ((stopAngleDeg % 360) + 360) % 360;
        draw();
        spinning = false;
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}
```

Then extend the returned object with `spinTo` and `isSpinning: () => spinning`.

Note `spinTo` animates from the *current* rotation to the absolute
`stopAngleDeg`. Because `planSpin` always returns at least 1440 degrees and the
stored rotation is normalised below 360, every spin travels at least three full
turns and still stops exactly where `planSpin` said.

- [ ] **Step 2: Replace `spinOnce()` in `src/app.js`**

```js
import { randomIndex, planSpin } from './rng.js';

async function spinOnce() {
  if (wheel.isSpinning()) return;

  const winnerIndex = randomIndex(state.run.pool);
  const winnerId = state.run.pool[winnerIndex];
  const teamName = teamLabel(currentTeamIndex(state.run));
  const plan = planSpin(state.run.pool.length, winnerIndex);

  el('winner-banner').hidden = true;
  setControlsEnabled(false);
  await wheel.spinTo(plan.stopAngleDeg);

  state.run = applyPick(state.run, winnerId);
  render();
  // Announced after the re-render, or the fresh render would wipe the banner
  // before anyone on the stream could read it.
  announce(`${nameOf(winnerId)} joins ${teamName}`);
}
```

Add the two helpers next to it:

```js
function setControlsEnabled(enabled) {
  for (const button of el('run-controls').querySelectorAll('button')) {
    button.disabled = !enabled;
  }
}

function announce(message) {
  const banner = el('winner-banner');
  banner.textContent = message;
  banner.hidden = false;
}
```

- [ ] **Step 3: Add the winner banner**

In `index.html`, inside `#run-view` directly after the wheel wrap:

```html
<p id="winner-banner" class="winner-banner" hidden></p>
```

In `styles.css`:

```css
.winner-banner {
  text-align: center; font-size: 30px; font-weight: 700;
  color: var(--accent); margin: 0 0 20px; min-height: 40px;
}
```

The banner is cleared at the *start* of `spinOnce()`, not inside `renderRun()`.
Clearing it during render would erase the winner immediately, because
`applyPick` triggers a re-render on the same tick the winner is announced. It
also needs clearing when a run begins, so add this line to `startWheelRun()`
and `beginDraftFromCaptains()` once that exists:

```js
  el('winner-banner').hidden = true;
```

- [ ] **Step 4: Change the button label**

In `renderRun()`, the control button now reads:

```js
  pick.textContent = `Spin (${picksRemaining(state.run)} left)`;
```

- [ ] **Step 5: Verify by hand**

1. Clicking Spin turns the wheel for about four seconds and decelerates smoothly.
2. The pointer stops inside a slice, not on a divider line.
3. The name under the pointer is exactly the name announced and the one added to the team.
4. Spinning is not clickable again while the wheel is turning.
5. Spinning for the same-sized pool twice stops at visibly different offsets.
6. The heading names the correct team before each spin, alternating A, B, A, B.
7. A full six-person run ends on the results view with 3 and 3.

Append as a `## Wheel spinning` section in `docs/MANUAL-CHECKS.md`.

**Check 3 is the important one** — it is the only end-to-end proof that the
`planSpin` geometry and the `wheel.js` drawing geometry agree. If the announced
winner and the slice under the pointer ever disagree, the two `-90` degree
offsets have drifted apart; fix the drawing, not the plan, since `planSpin` is
the tested side.

- [ ] **Step 6: Commit**

```bash
git add src/wheel.js src/app.js index.html styles.css docs/MANUAL-CHECKS.md
git commit -m "feat: animate the wheel to the planned stop angle"
```

---

## Task 10: Draft pick sequences

**Files:**
- Create: `src/draft.js`
- Test: `test/draft.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `DRAFT_ORDERS = ['snake', 'alternating']`, `draftSequence(teamCount, pickCount, order): number[]` — an array of team indices, one per pick, length exactly `pickCount`. Throws on an unknown order.

**Note for the implementer:** a snake draft deliberately does *not* produce the
same team sizes as `teamSizes()`. With 5 people, 2 teams, and captains seeded,
snake gives Team B the extra player and alternating gives it to Team A. Both are
correct 3-and-2 splits. Do not "fix" this by forcing the sizes to match.

- [ ] **Step 1: Write the failing test**

Create `test/draft.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftSequence } from '../src/draft.js';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module .../src/draft.js`

- [ ] **Step 3: Write the implementation**

Create `src/draft.js`:

```js
export const DRAFT_ORDERS = ['snake', 'alternating'];

export function draftSequence(teamCount, pickCount, order) {
  if (!DRAFT_ORDERS.includes(order)) {
    throw new Error(`Unknown draft order: ${order}`);
  }
  const sequence = [];
  for (let round = 0; sequence.length < pickCount; round++) {
    const forward = order === 'alternating' || round % 2 === 0;
    for (let i = 0; i < teamCount && sequence.length < pickCount; i++) {
      sequence.push(forward ? i : teamCount - 1 - i);
    }
  }
  return sequence;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 5 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/draft.js test/draft.test.js
git commit -m "feat: add snake and alternating draft sequences"
```

---

## Task 11: Draft setup and captain selection

Captains are either spun for or hand-picked. The spin path reuses the wheel
already built, running one spin per team.

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Modify: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: `draftSequence` (Task 10); `startRun`, `isComplete` (Task 6); `teamLabel`, `validateSetup` (Task 3); the wheel (Tasks 8 and 9).
- Produces: `state.config.draftOrder: 'snake'|'alternating'`, `state.config.captainMode: 'spin'|'choose'`, `state.captains: string[]`, `startDraft()`, `beginDraftFromCaptains(captainIds)`, `validateDraftSetup(): {ok, reason?}`.

- [ ] **Step 1: Add the draft controls to `index.html`**

Inside the config panel, after the team count input:

```html
<fieldset class="draft-options">
  <legend>Captain draft</legend>
  <label><input type="radio" name="draft-order" value="snake" checked> Snake (A B B A)</label>
  <label><input type="radio" name="draft-order" value="alternating"> Alternating (A B A B)</label>
  <hr>
  <label><input type="radio" name="captain-mode" value="spin" checked> Spin for captains</label>
  <label><input type="radio" name="captain-mode" value="choose"> Choose captains</label>
  <ul id="captain-list" class="roster-list" hidden></ul>
</fieldset>
```

- [ ] **Step 2: Style it in `styles.css`**

```css
.draft-options {
  border: 1px solid var(--line); border-radius: 10px;
  padding: 14px 16px; margin: 18px 0 0;
}
.draft-options legend { color: var(--muted); padding: 0 6px; }
.draft-options label { display: block; padding: 4px 0; cursor: pointer; }
.draft-options hr { border: none; border-top: 1px solid var(--line); margin: 10px 0; }
```

- [ ] **Step 3: Persist the new config in `src/app.js`**

`storage.js` already defaults `draftOrder`. Add `captainMode` to the app state
without changing the storage schema — it is a per-session choice:

```js
state.config.captainMode = state.config.captainMode ?? 'spin';
state.captains = [];
```

- [ ] **Step 4: Render the captain list and validate it**

```js
function validateDraftSetup() {
  const base = validateSetup({
    presentCount: state.present.length,
    teamCount: state.config.teamCount,
  });
  if (!base.ok) return base;
  if (state.config.captainMode === 'choose' && state.captains.length !== state.config.teamCount) {
    return {
      ok: false,
      reason: `Pick exactly ${state.config.teamCount} captains (${state.captains.length} selected)`,
    };
  }
  return { ok: true };
}

function renderCaptainList() {
  const list = el('captain-list');
  const choosing = state.config.captainMode === 'choose';
  list.hidden = !choosing;
  list.replaceChildren();
  if (!choosing) return;

  for (const id of state.present) {
    const li = document.createElement('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.captains.includes(id);
    box.addEventListener('change', () => {
      state.captains = box.checked
        ? [...state.captains, id]
        : state.captains.filter((x) => x !== id);
      render();
    });
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = nameOf(id);
    li.append(box, name);
    list.append(li);
  }
}
```

Call `renderCaptainList()` from `renderSetup()`, drop any captain who is no
longer present (`state.captains = state.captains.filter((id) => state.present.includes(id))`
at the top of `renderSetup`), and gate the draft button on the draft-specific check:

```js
  const draftCheck = validateDraftSetup();
  el('start-draft-btn').disabled = !draftCheck.ok;
  if (check.ok && !draftCheck.ok) showError(draftCheck.reason);
```

- [ ] **Step 5: Wire the radios**

```js
for (const radio of document.querySelectorAll('input[name="draft-order"]')) {
  radio.checked = radio.value === state.config.draftOrder;
  radio.addEventListener('change', () => {
    state.config.draftOrder = radio.value;
    persist();
    render();
  });
}

for (const radio of document.querySelectorAll('input[name="captain-mode"]')) {
  radio.checked = radio.value === state.config.captainMode;
  radio.addEventListener('change', () => {
    state.config.captainMode = radio.value;
    state.captains = [];
    render();
  });
}
```

- [ ] **Step 6: Start the draft**

Add the draft import to the top of `src/app.js`:

```js
import { draftSequence } from './draft.js';
```

```js
function beginDraftFromCaptains(captainIds) {
  const teamCount = state.config.teamCount;
  const present = [...state.present];
  state.run = startRun({
    mode: 'draft',
    present,
    teamCount,
    order: draftSequence(teamCount, present.length - teamCount, state.config.draftOrder),
    seeded: captainIds.map((id) => [id]),
  });
  render();
}

function startDraft() {
  if (state.config.captainMode === 'choose') {
    beginDraftFromCaptains(state.captains);
    return;
  }
  // Spin once per team; each winner becomes that team's captain.
  const present = [...state.present];
  state.run = startRun({
    mode: 'captains',
    present,
    teamCount: state.config.teamCount,
    order: Array.from({ length: state.config.teamCount }, (_, i) => i),
  });
  render();
}

el('start-draft-btn').addEventListener('click', startDraft);
```

- [ ] **Step 7: Route the finished captain spin into the draft**

In `render()`, before deciding which view to show:

```js
  // A finished captain spin is not a result — it seeds the draft.
  if (state.run && state.run.mode === 'captains' && isComplete(state.run)) {
    const captainIds = state.run.teams.map((team) => team.members[0]);
    state.run = null;
    beginDraftFromCaptains(captainIds);
    return;
  }
```

And in `renderRun()`, make the heading mode-aware:

```js
  const teamName = teamLabel(currentTeamIndex(state.run));
  el('turn-heading').textContent = state.run.mode === 'captains'
    ? `Spinning for ${teamName}'s captain`
    : `Spinning for ${teamName}`;
```

- [ ] **Step 8: Verify by hand**

1. Choosing "Choose captains" reveals a checkbox list of the present people only.
2. With 2 teams, selecting 1 captain disables the draft button and says "Pick exactly 2 captains (1 selected)".
3. Selecting 2 captains enables it and starts the draft with each captain already on a team.
4. With "Spin for captains", the wheel spins twice, headings read "Spinning for Team A's captain" then Team B's.
5. After the second captain spin, the draft board appears with both captains seeded and neither still in the pool.
6. Unchecking a present person also drops them as a captain.
7. The snake and alternating choice survives a refresh; the captain mode resets to spin.

Append as a `## Draft setup` section in `docs/MANUAL-CHECKS.md`.

- [ ] **Step 9: Commit**

```bash
git add index.html styles.css src/app.js docs/MANUAL-CHECKS.md
git commit -m "feat: add captain selection by spin or by hand"
```

---

## Task 12: The draft board

A tracker, not a decider. The person at the keyboard clicks whichever name the
captain just called out.

**Files:**
- Modify: `index.html`
- Modify: `styles.css`
- Modify: `src/app.js`
- Modify: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: `applyPick`, `currentTeamIndex`, `picksRemaining`, `isComplete` (Task 6); `teamLabel` (Task 3); `teamColumns`, `nameOf` (Task 7).
- Produces: `renderDraft()` in `app.js`, plus the `draft-view` section.

- [ ] **Step 1: Add the draft view to `index.html`**

After `#run-view`:

```html
<section id="draft-view" class="view" hidden>
  <h2 id="draft-heading" class="turn-heading"></h2>
  <div id="draft-pool" class="draft-pool"></div>
  <div id="draft-controls" class="start-buttons"></div>
  <div id="draft-teams"></div>
</section>
```

- [ ] **Step 2: Style the pool buttons in `styles.css`**

```css
.draft-pool { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0 24px; }
.draft-pool button {
  background: var(--panel); color: var(--text);
  border: 1px solid var(--line); font-size: 24px; padding: 14px 22px;
}
.draft-pool button:hover { border-color: var(--accent); color: var(--accent); }
```

- [ ] **Step 3: Render it in `src/app.js`**

```js
function renderDraft() {
  const teamIndex = currentTeamIndex(state.run);
  const totalPicks = state.run.order.length;
  const pickNumber = state.run.turnIndex + 1;
  el('draft-heading').textContent =
    `${teamLabel(teamIndex)} picks — pick ${pickNumber} of ${totalPicks}`;

  const pool = el('draft-pool');
  pool.replaceChildren();
  for (const id of state.run.pool) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = nameOf(id);
    button.addEventListener('click', () => {
      state.run = applyPick(state.run, id);
      render();
    });
    pool.append(button);
  }

  el('draft-teams').replaceChildren(teamColumns(state.run.teams));
  el('draft-controls').replaceChildren();
}
```

- [ ] **Step 4: Route to it from `render()`**

```js
export function render() {
  if (state.run && state.run.mode === 'captains' && isComplete(state.run)) {
    const captainIds = state.run.teams.map((team) => team.members[0]);
    state.run = null;
    beginDraftFromCaptains(captainIds);
    return;
  }

  const running = Boolean(state.run);
  const finished = running && isComplete(state.run);
  const drafting = running && !finished && state.run.mode === 'draft';

  el('setup-view').hidden = running;
  el('run-view').hidden = !running || finished || drafting;
  el('draft-view').hidden = !drafting;
  el('results-view').hidden = !finished;

  if (!running) renderSetup();
  else if (finished) renderResults();
  else if (drafting) renderDraft();
  else renderRun();
}
```

- [ ] **Step 5: Verify by hand**

With six people, 2 teams, hand-picked captains:

1. The board shows the four non-captains as large buttons.
2. The heading reads "Team A picks — pick 1 of 4".
3. Clicking a name moves it into Team A and the heading advances to Team B.
4. In **snake** order the sequence of picking teams is A, B, B, A.
5. In **alternating** order it is A, B, A, B.
6. A clicked name disappears from the pool and cannot be picked twice.
7. After the last pick the results view appears with all six people placed.
8. With 3 teams and 9 people, snake picks run A, B, C, C, B, A.

Append as a `## Draft board` section in `docs/MANUAL-CHECKS.md`.

- [ ] **Step 6: Commit**

```bash
git add index.html styles.css src/app.js docs/MANUAL-CHECKS.md
git commit -m "feat: add the draft board"
```

---

## Task 13: Undo, keyboard, and the final pass

**Files:**
- Modify: `src/app.js`
- Modify: `styles.css`
- Modify: `README.md` (create)
- Modify: `docs/MANUAL-CHECKS.md`

**Interfaces:**
- Consumes: `undoPick` (Task 6), everything already built.
- Produces: `undoLast()`, `addUndoButton(container)` in `app.js`; a `README.md` describing the app and how to run the tests.

- [ ] **Step 1: Add undo to both modes in `src/app.js`**

```js
import { startRun, applyPick, undoPick, currentTeamIndex, isComplete, picksRemaining } from './run.js';

function undoLast() {
  if (wheel.isSpinning()) return;
  if (!state.run || state.run.history.length === 0) return;
  state.run = undoPick(state.run);
  render();
}

function addUndoButton(container) {
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'secondary';
  undo.textContent = 'Undo last pick';
  undo.disabled = state.run.history.length === 0;
  undo.addEventListener('click', undoLast);
  container.append(undo);
}
```

Call `addUndoButton(el('run-controls'))` at the end of `renderRun()` and
`addUndoButton(el('draft-controls'))` at the end of `renderDraft()` — replacing
the `el('draft-controls').replaceChildren();` line with a `replaceChildren()`
followed by the call.

Add a **Back to setup** button to the same two containers so an abandoned run
does not trap you:

```js
function addAbandonButton(container) {
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'secondary';
  back.textContent = 'Back to setup';
  back.addEventListener('click', () => {
    if (wheel.isSpinning()) return;
    state.run = null;
    render();
  });
  container.append(back);
}
```

- [ ] **Step 2: Add undo to the results view**

A finished run should still be correctable. In `renderResults()`, add an undo
button to the `actions` div before "Back to setup" — `undoPick` already handles
rewinding out of the completed state, and `render()` will drop back to the run
or draft view automatically because `isComplete` turns false again.

- [ ] **Step 3: Add the space bar shortcut**

```js
document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  if (event.target.matches('input, textarea, button')) return;
  if (!state.run || state.run.mode === 'draft' || isComplete(state.run)) return;
  event.preventDefault();
  spinOnce();
});
```

The `button` check matters: without it, space would both activate a focused
button and fire this handler, double-spinning.

- [ ] **Step 4: Tighten the screen-share look in `styles.css`**

```css
@media (min-width: 900px) {
  h1 { font-size: 48px; }
  .turn-heading { font-size: 40px; }
  .team-column li { font-size: 28px; }
}
```

- [ ] **Step 5: Write `README.md`**

```markdown
# Random Team Generator

A wheel spinner and captain-draft tracker for splitting a Discord call into teams.

- **Wheel mode** — spin once per person; each winner joins the next team in rotation.
- **Draft mode** — captains pick their own teammates in snake or alternating order.

The roster and your check-offs are saved in the browser, so the same people are
already ticked next time.

## Running it

Open `index.html` through any static server:

    python -m http.server 8080

## Tests

    npm test

Pure logic (`teams`, `draft`, `run`, `roster`, `rng`, `format`, `storage`) is
covered by Node's built-in test runner. The canvas wheel and the DOM wiring are
verified by hand against `docs/MANUAL-CHECKS.md`.
```

- [ ] **Step 6: Run the full suite and the whole checklist**

Run: `npm test`
Expected: PASS — every test from Tasks 1, 2, 3, 5, 6, 7, and 10.

Then walk `docs/MANUAL-CHECKS.md` end to end on the live GitHub Pages URL, not
just locally. Add and confirm these final checks:

1. Undo during a wheel run puts the person back on the wheel in their old slice position.
2. Undo is disabled before the first pick of a run.
3. Undo from the results view reopens the run with the last pick reversed.
4. Space bar spins the wheel, and typing a name into the roster input never triggers a spin.
5. Space bar does nothing on the draft board.
6. "Back to setup" mid-run returns to the roster with check-offs intact.
7. A full 8-person, 3-team wheel run and a full 8-person, 3-team snake draft both complete correctly.

- [ ] **Step 7: Commit and deploy**

```bash
git add src/app.js styles.css README.md docs/MANUAL-CHECKS.md
git commit -m "feat: add undo, keyboard spinning, and screen-share polish"
git push
```

Confirm the live URL reflects the final build.

---

## Coverage against the spec

| Spec section | Task |
|---|---|
| Constraints (no deps, ES modules, Pages) | 1, 4 |
| Architecture and DOM isolation | 1–13 (enforced by Global Constraints) |
| Data model and persistence | 1, 4 |
| Team sizing | 3 |
| Wheel mode flow | 7, 8, 9 |
| Landing position | 5, 9 |
| Draft mode | 10, 11, 12 |
| Shared behavior (one results view) | 7, 12 |
| Failure modes | 1 (storage), 2 (names), 3 (counts), 11 (captains), 8 (resize) |
| Testing | 1, 2, 3, 5, 6, 7, 10 (automated); 4, 8, 9, 11, 12, 13 (manual checklist) |
| Out of scope (sound, share URLs, mobile) | not implemented, by design |
