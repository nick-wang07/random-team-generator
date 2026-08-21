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

// id of the roster row currently in edit mode, or null. Not part of `state` —
// it's transient UI state, not something that gets persisted.
let editingId = null;

function nameButton(person) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'name name-btn';
  button.textContent = person.name;
  button.addEventListener('click', () => {
    editingId = person.id;
    render();
  });
  return button;
}

function nameEditor(person) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-edit';
  input.value = person.name;

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
      persist();
      render();
    } catch (err) {
      // Leave the editor open with the typed text so the host can fix it.
      settled = false;
      showError(err.message);
    }
  }

  function cancel() {
    if (settled) return;
    settled = true;
    editingId = null;
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
    if (editingId === person.id) editingId = null;
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
      input.select();
    }
  }
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
