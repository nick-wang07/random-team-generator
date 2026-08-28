import { browserBackend, createStorage } from './storage.js';
import { addPerson, removePerson, renamePerson, prunePresent, findPerson } from './roster.js';
import { validateSetup, pickRotation, teamLabel } from './teams.js';
import { randomIndex, planSpin } from './rng.js';
import { startRun, applyPick, undoPick, currentTeamIndex, isComplete, picksRemaining } from './run.js';
import { formatTeams } from './format.js';
import { createWheel } from './wheel.js';
import { draftSequence } from './draft.js';

const store = createStorage(browserBackend());
const loaded = store.load();

export const state = {
  roster: loaded.roster,
  present: prunePresent(loaded.roster, loaded.present),
  config: loaded.config,
  run: null,
};
// `captainMode` is a per-session choice: persist()/save() writes it out as
// part of state.config like everything else, but storage.js's load() only
// reads back `teamCount` and `draftOrder` and drops the rest, so it resets
// to the default every session rather than surviving a refresh.
state.config.captainMode = state.config.captainMode ?? 'spin';
state.captains = [];

const el = (id) => document.getElementById(id);

const wheel = createWheel(el('wheel-canvas'));
window.addEventListener('resize', () => { wheel.resize(); wheel.draw(); });

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

function renderSetup() {
  // Drop any captain who is no longer present (unchecked from the roster).
  state.captains = state.captains.filter((id) => state.present.includes(id));

  renderRoster();
  renderCaptainList();
  el('team-count').value = String(state.config.teamCount);
  const check = validateSetup({
    presentCount: state.present.length,
    teamCount: state.config.teamCount,
  });
  // An unresolved editor error takes priority over the team-count message so
  // an incidental re-render (checkbox, add, team count) doesn't erase it.
  showError(editingId && editingError ? editingError : check.ok ? '' : check.reason);
  el('start-wheel-btn').disabled = !check.ok;

  const draftCheck = validateDraftSetup();
  el('start-draft-btn').disabled = !draftCheck.ok;
  // Same priority as above: an unresolved editor error must not be clobbered
  // by the draft-specific message on an incidental re-render either.
  if (check.ok && !draftCheck.ok && !(editingId && editingError)) showError(draftCheck.reason);
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
  // A rename that failed to commit (blur-rejected) can leave the editor
  // logically open right up to the moment the host clicks a Start button in
  // the same gesture. Starting a run abandons whatever row was mid-edit, so
  // clear the flags here rather than let "Back to setup" reopen that row
  // with the rejected text and a stale error over setup validation.
  editingId = null;
  editingDraft = null;
  editingError = null;
  hideBanner();
  render();
}

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
  hideBanner();
  render();
}

function startDraft() {
  // See the matching comment in startWheelRun: starting any run abandons
  // whatever roster row was mid-edit, so clear the editor flags here too.
  editingId = null;
  editingDraft = null;
  editingError = null;
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

function setControlsEnabled(enabled) {
  for (const button of el('run-controls').querySelectorAll('button')) {
    button.disabled = !enabled;
  }
}

// The banner uses visibility (not the `hidden` attribute/display:none) so its
// reserved min-height stays in the layout at all times — toggling display
// would yank the run controls below it up and down by ~50px on every spin.
function hideBanner() {
  const banner = el('winner-banner');
  banner.classList.remove('visible');
  // Clear the text too, not just hide visually — otherwise a stale winner
  // name sits in the DOM, readable via inspection/selection, while merely
  // invisible on screen.
  banner.textContent = '';
}

function announce(message) {
  const banner = el('winner-banner');
  banner.textContent = message;
  banner.classList.add('visible');
}

async function spinOnce() {
  if (wheel.isSpinning()) return;

  const winnerIndex = randomIndex(state.run.pool);
  const winnerId = state.run.pool[winnerIndex];
  const teamName = teamLabel(currentTeamIndex(state.run));
  const plan = planSpin(state.run.pool.length, winnerIndex);

  hideBanner();
  setControlsEnabled(false);
  try {
    await wheel.spinTo(plan.stopAngleDeg);
  } finally {
    // Restored on every path, including a rejected/aborted spin, so a
    // failure never leaves the controls stuck disabled with the winner
    // already drawn but nowhere applied.
    setControlsEnabled(true);
  }

  state.run = applyPick(state.run, winnerId);
  render();
  // Announced after the re-render, or the fresh render would wipe the banner
  // before anyone on the stream could read it.
  announce(`${nameOf(winnerId)} joins ${teamName}`);
}

function undoLast() {
  if (wheel.isSpinning()) return;
  if (!state.run || state.run.history.length === 0) return;
  state.run = undoPick(state.run);
  hideBanner();
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
  const teamName = teamLabel(currentTeamIndex(state.run));
  el('turn-heading').textContent = state.run.mode === 'captains'
    ? `Spinning for ${teamName}'s captain`
    : `Spinning for ${teamName}`;

  wheel.setSlices(state.run.pool.map(nameOf));
  wheel.resize();
  wheel.draw();

  const controls = el('run-controls');
  controls.replaceChildren();
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.textContent = `Spin (${picksRemaining(state.run)} left)`;
  pick.addEventListener('click', spinOnce);
  controls.append(pick);
  addUndoButton(controls);
  addAbandonButton(controls);

  const teams = el('run-teams');
  teams.replaceChildren(teamColumns(state.run.teams));
}

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
  const draftControls = el('draft-controls');
  draftControls.replaceChildren();
  addUndoButton(draftControls);
  addAbandonButton(draftControls);
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
    try {
      await navigator.clipboard.writeText(formatTeams(state.run.teams, state.roster));
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Copy failed';
    }
    setTimeout(() => { copy.textContent = 'Copy for Discord'; }, 1500);
  });

  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'secondary';
  again.textContent = 'Back to setup';
  again.addEventListener('click', () => { state.run = null; render(); });

  const actions = document.createElement('div');
  actions.className = 'start-buttons';
  actions.append(copy);
  addUndoButton(actions);
  actions.append(again);

  view.append(heading, teamColumns(state.run.teams), actions);
}

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
  const raw = el('team-count').value;
  // An empty field (host clearing the box to retype) is not "0 teams" — bail
  // out without persisting or re-rendering so the host can keep typing.
  // renderSetup() would otherwise write "0" straight back into the field on
  // the next render, and a refresh mid-edit would reopen the app looking
  // broken with 0 teams saved.
  if (raw === '') return;
  state.config.teamCount = Number(raw);
  persist();
  render();
});

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

el('start-wheel-btn').addEventListener('click', startWheelRun);
el('start-draft-btn').addEventListener('click', startDraft);

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  if (event.target.matches('input, textarea, button')) return;
  if (!state.run || state.run.mode === 'draft' || isComplete(state.run)) return;
  event.preventDefault();
  spinOnce();
});

render();
