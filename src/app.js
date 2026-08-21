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
