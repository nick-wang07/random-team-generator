import { browserBackend, createStorage } from './storage.js';
import { addPerson, removePerson, renamePerson, prunePresent, findPerson } from './roster.js';
import { validateSetup, pickRotation, teamLabel } from './teams.js';
import { randomIndex } from './rng.js';
import { startRun, applyPick, currentTeamIndex, isComplete, picksRemaining } from './run.js';
import { formatTeams } from './format.js';

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

// id of the roster row currently in edit mode, or null. Not part of `state` —
// it's transient UI state, not something that gets persisted.
let editingId = null;
// Live snapshot of the open editor's <input>, captured just before any
// render() rebuilds the roster list out from under it. render() gets called
// for lots of reasons unrelated to the edit in progress (a different row's
// checkbox, adding a person, changing the team count) — without this, each
// of those would silently reset the editor back to the persisted name.
let editingDraft = null; // { id, value, selectionStart, selectionEnd } | null
// Error message tied to the still-open editor (e.g. a rejected duplicate/empty
// name). renderSetup() prefers this over the team-count validation message so
// an incidental re-render doesn't clobber an error the host hasn't resolved yet.
let editingError = null;
// True only for the render() that first opens an editor, so the initial open
// selects the whole name (for fast overtyping) without re-selecting-all — and
// eating the next keystroke — on every incidental re-render while mid-typing.
let editingJustOpened = false;

function nameButton(person) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'name name-btn';
  button.textContent = person.name;
  button.addEventListener('click', () => {
    editingId = person.id;
    editingDraft = null;
    editingError = null;
    editingJustOpened = true;
    render();
  });
  return button;
}

function nameEditor(person) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-edit';
  // Tags which person this live input belongs to, so renderRoster()'s
  // pre-rebuild snapshot never mistakes a different (possibly abandoned)
  // row's leftover editor for the one that's actually still open.
  input.dataset.personId = person.id;
  input.value = editingDraft && editingDraft.id === person.id ? editingDraft.value : person.name;

  // Guards against a commit firing twice: committing/cancelling detaches this
  // input via render(), and browsers fire a blur event on an element removed
  // from the document, which would otherwise re-trigger the blur handler below.
  let settled = false;

  function commit() {
    if (settled) return;
    settled = true;
    try {
      state.roster = renamePerson(state.roster, person.id, input.value);
      editingId = null;
      editingDraft = null;
      editingError = null;
      persist();
      render();
    } catch (err) {
      // Leave the editor open with the typed text so the host can fix it.
      settled = false;
      editingError = err.message;
      showError(err.message);
    }
  }

  function cancel() {
    if (settled) return;
    settled = true;
    editingId = null;
    editingDraft = null;
    editingError = null;
    render();
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  });
  input.addEventListener('blur', commit);

  return input;
}

function rosterRow(person) {
  const li = document.createElement('li');

  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = state.present.includes(person.id);
  box.addEventListener('change', () => togglePresent(person.id, box.checked));

  const name = editingId === person.id ? nameEditor(person) : nameButton(person);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'remove';
  remove.addEventListener('click', () => {
    if (editingId === person.id) {
      editingId = null;
      editingDraft = null;
      editingError = null;
    }
    state.roster = removePerson(state.roster, person.id);
    state.present = prunePresent(state.roster, state.present);
    persist();
    render();
  });

  li.append(box, name, remove);
  return li;
}

function renderRoster() {
  const list = el('roster-list');
  // Snapshot the live editor (value + caret) before it gets torn down, so an
  // unrelated render() can restore it below instead of resetting to the
  // persisted name.
  if (editingId) {
    const liveInput = list.querySelector('.name-edit');
    // Only trust this input if it actually belongs to the row we're still
    // editing. A row whose commit failed (and therefore skipped render())
    // can leave a stale, abandoned .name-edit for a DIFFERENT person in the
    // DOM — e.g. row A errors and is left open, then the host clicks
    // straight into row B's editor without resolving A first. Without this
    // check, A's leftover text would leak into B's freshly-opened editor.
    if (liveInput && liveInput.dataset.personId === editingId) {
      editingDraft = {
        id: editingId,
        value: liveInput.value,
        selectionStart: liveInput.selectionStart,
        selectionEnd: liveInput.selectionEnd,
      };
    }
  }
  list.replaceChildren();
  if (state.roster.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No one yet — add your friends below.';
    list.append(li);
    return;
  }
  list.append(...state.roster.map(rosterRow));
  if (editingId) {
    const input = list.querySelector('.name-edit');
    if (input) {
      input.focus();
      if (editingJustOpened) {
        input.select();
      } else if (editingDraft && editingDraft.selectionStart != null) {
        input.setSelectionRange(editingDraft.selectionStart, editingDraft.selectionEnd);
      }
    }
  }
  editingJustOpened = false;
}

function renderSetup() {
  renderRoster();
  el('team-count').value = String(state.config.teamCount);
  const check = validateSetup({
    presentCount: state.present.length,
    teamCount: state.config.teamCount,
  });
  // An unresolved editor error takes priority over the team-count message so
  // an incidental re-render (checkbox, add, team count) doesn't erase it.
  showError(editingId && editingError ? editingError : check.ok ? '' : check.reason);
  el('start-wheel-btn').disabled = !check.ok;
  el('start-draft-btn').disabled = !check.ok;
}

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
    // A stale open-editor error (if any) shouldn't silently resurface over
    // this add-form error on the next incidental render — the host's
    // attention is on the add form right now, not the abandoned editor.
    editingError = null;
    showError(err.message);
  }
});

el('team-count').addEventListener('input', () => {
  state.config.teamCount = Number(el('team-count').value);
  persist();
  render();
});

el('start-wheel-btn').addEventListener('click', startWheelRun);

render();
