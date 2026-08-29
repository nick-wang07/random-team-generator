import { browserBackend, createStorage } from './storage.js';
import { addPerson, removePerson, renamePerson, prunePresent, findPerson } from './roster.js';
import { validateSetup, pickRotation, teamLabel, teamSizes } from './teams.js';
import { randomIndex, planSpin } from './rng.js';
import { startRun, applyPick, undoPick, currentTeamIndex, isComplete, picksRemaining } from './run.js';
import { formatTeams } from './format.js';
import { teamColumns } from './team-view.js';
import { createWheel } from './wheel.js';
import { createReveal } from './reveal.js';
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
// Same deal: which of the two ways to pick teams is on screen. Session-only.
state.config.pickMode = state.config.pickMode ?? 'wheel';
state.captains = [];

const el = (id) => document.getElementById(id);

const wheel = createWheel(el('wheel-canvas'));
window.addEventListener('resize', () => { wheel.resize(); wheel.draw(); });
// Click the wheel to cut a spin short. It lands on the same angle either way,
// so this only skips the wait — it cannot change who won.
el('wheel-canvas').addEventListener('click', () => wheel.finish());

const reveal = createReveal({
  overlay: el('reveal-overlay'),
  nameNode: el('reveal-name'),
  teamNode: el('reveal-team'),
  closeButton: el('reveal-close'),
});
const isRevealing = () => reveal.isRevealing();

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
// The last person removed from the roster, kept only so it can be undone.
// { person, index, wasPresent } | null
let removedPerson = null;

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
  remove.title = `Remove ${person.name} from the roster`;
  remove.addEventListener('click', () => {
    if (editingId === person.id) {
      editingId = null;
      editingDraft = null;
      editingError = null;
    }
    // The roster is the one thing here that outlives the session, so a
    // misclick on remove is the only genuinely destructive act in the app.
    // Keep enough to put them back exactly where they were.
    removedPerson = { person, index: state.roster.findIndex((p) => p.id === person.id), wasPresent: state.present.includes(person.id) };
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

function renderRemovalNotice() {
  const box = el('removal-notice');
  if (!removedPerson) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  const text = document.createElement('span');
  text.textContent = `Removed ${removedPerson.person.name}.`;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'link-btn';
  undo.textContent = 'Undo';
  undo.addEventListener('click', () => {
    const { person, index, wasPresent } = removedPerson;
    const roster = [...state.roster];
    roster.splice(Math.min(index, roster.length), 0, person);
    state.roster = roster;
    if (wasPresent) state.present = [...new Set([...state.present, person.id])];
    removedPerson = null;
    persist();
    render();
  });
  box.replaceChildren(text, undo);
  box.hidden = false;
}

function renderPresence() {
  const present = state.present.length;
  const total = state.roster.length;
  el('present-count').textContent = total === 0
    ? ''
    : `${present} of ${total} in the call`;

  // One button that does whichever is useful: tick everyone, or clear them.
  const toggle = el('select-all-btn');
  const allPresent = total > 0 && present === total;
  toggle.hidden = total === 0;
  toggle.textContent = allPresent ? 'Clear all' : 'Select all';
  toggle.dataset.action = allPresent ? 'clear' : 'select';
}

// "2 teams of 4", or "3 teams: 4, 3, 3" when it does not divide evenly, so
// the host can sanity-check the team count before committing to it.
function splitPreview() {
  const present = state.present.length;
  const teamCount = state.config.teamCount;
  if (!validateSetup({ presentCount: present, teamCount }).ok) return '';
  const sizes = teamSizes(present, teamCount);
  return sizes.every((n) => n === sizes[0])
    ? `${teamCount} teams of ${sizes[0]}`
    : `${teamCount} teams: ${sizes.join(', ')}`;
}

function renderSetup() {
  // Drop any captain who is no longer present (unchecked from the roster).
  state.captains = state.captains.filter((id) => state.present.includes(id));

  renderRoster();
  renderCaptainList();
  renderPresence();
  renderRemovalNotice();
  el('team-count').value = String(state.config.teamCount);
  const check = validateSetup({
    presentCount: state.present.length,
    teamCount: state.config.teamCount,
  });
  // An unresolved editor error takes priority over the team-count message so
  // an incidental re-render (checkbox, add, team count) doesn't erase it.
  showError(editingId && editingError ? editingError : check.ok ? '' : check.reason);

  // Everything specific to the draft — pick order, captains, the captain
  // list — stays out of sight until the draft is the chosen mode, and only
  // the start button for the chosen mode is offered.
  const drafting = state.config.pickMode === 'draft';
  el('draft-config').hidden = !drafting;
  el('start-wheel-btn').hidden = drafting;
  el('start-draft-btn').hidden = !drafting;

  el('split-preview').textContent = splitPreview();

  el('start-wheel-btn').disabled = !check.ok;
  const draftCheck = validateDraftSetup();
  el('start-draft-btn').disabled = !draftCheck.ok;
  // Same priority as above: an unresolved editor error must not be clobbered
  // by the draft-specific message on an incidental re-render either. The
  // draft's own complaint is only relevant while the draft is on screen.
  if (drafting && check.ok && !draftCheck.ok && !(editingId && editingError)) {
    showError(draftCheck.reason);
  }
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



async function spinOnce() {
  if (wheel.isSpinning() || isRevealing()) return;

  const winnerIndex = randomIndex(state.run.pool);
  const winnerId = state.run.pool[winnerIndex];
  const teamName = teamLabel(currentTeamIndex(state.run));
  // A one-slice wheel is the whole disc: there is no suspense left to build
  // and spinning it just costs everyone four seconds. Straight to the card.
  const lastOne = state.run.pool.length === 1;

  setControlsEnabled(false);
  try {
    if (!lastOne) {
      await wheel.spinTo(planSpin(state.run.pool.length, winnerIndex).stopAngleDeg);
    }
    // Held open before the pick is applied: render() redraws the wheel without
    // the winner, so applying first would erase the slice everyone is looking
    // at. The wheel stays stopped on them for as long as the card is up.
    await reveal.show(nameOf(winnerId), teamName);
  } finally {
    // Restored on every path, including a rejected/aborted spin, so a
    // failure never leaves the controls stuck disabled with the winner
    // already drawn but nowhere applied.
    setControlsEnabled(true);
  }

  state.run = applyPick(state.run, winnerId);
  render();
}

function undoLast() {
  if (wheel.isSpinning() || isRevealing()) return;
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

function addAbandonButton(container) {
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'secondary';
  back.textContent = 'Back to setup';
  back.addEventListener('click', () => {
    if (wheel.isSpinning() || isRevealing()) return;
    state.run = null;
    render();
  });
  container.append(back);
}


function renderRun() {
  const teamName = teamLabel(currentTeamIndex(state.run));
  el('turn-heading').textContent = state.run.mode === 'captains'
    ? `Spinning for ${teamName}'s captain`
    : `Spinning for ${teamName}`;

  wheel.setSlices(state.run.pool.map(nameOf));

  const controls = el('run-controls');
  controls.replaceChildren();
  const pick = document.createElement('button');
  pick.type = 'button';
  pick.textContent = state.run.pool.length === 1
    ? 'Reveal the last one'
    : `Spin (${picksRemaining(state.run)} left)`;
  pick.addEventListener('click', spinOnce);
  controls.append(pick);
  addUndoButton(controls);
  addAbandonButton(controls);

  // Teams flank the wheel: the first half of them down the left, the rest
  // down the right. With the usual two teams that is simply A and B. Same
  // treatment as the draft board — the team about to receive this spin is
  // outlined, and unfilled places show as slots — so the two screens render
  // the same data the same way.
  const teamIndex = currentTeamIndex(state.run);
  const split = Math.ceil(state.run.teams.length / 2);
  const finalSizes = teamSizes(
    state.run.teams.reduce((n, team) => n + team.members.length, 0) + state.run.pool.length,
    state.run.teams.length,
  );
  el('run-teams-left').replaceChildren(teamColumns(state.run.teams.slice(0, split), {
    roster: state.roster,
    activeIndex: teamIndex,
    slots: finalSizes.slice(0, split),
  }));
  el('run-teams-right').replaceChildren(teamColumns(state.run.teams.slice(split), {
    roster: state.roster,
    activeIndex: teamIndex === null ? null : teamIndex - split,
    slots: finalSizes.slice(split),
  }));

  wheel.resize();
  wheel.draw();
}

// The pick order laid out as a strip, with the current pick marked. Snake
// order means a team sometimes picks twice in a row, which looks like a bug
// unless you can see the shape of the whole thing.
function renderPickOrder() {
  const strip = el('draft-order-strip');
  strip.replaceChildren();
  state.run.order.forEach((teamIndex, i) => {
    const step = document.createElement('span');
    step.className = 'order-step';
    if (i < state.run.turnIndex) step.classList.add('is-done');
    if (i === state.run.turnIndex) step.classList.add('is-now');
    step.textContent = teamLabel(teamIndex).replace('Team ', '');
    strip.append(step);
  });
}

function renderDraft() {
  const teamIndex = currentTeamIndex(state.run);
  const totalPicks = state.run.order.length;
  const pickNumber = state.run.turnIndex + 1;
  el('draft-heading').textContent =
    `${teamLabel(teamIndex)} picks — pick ${pickNumber} of ${totalPicks}`;
  renderPickOrder();

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

  // Same shape as the wheel screen: teams either side, the thing you act on
  // in the middle. Sizes are what each team will finish with, so the columns
  // show the shape of the finished teams from the first pick.
  const finalSizes = teamSizes(
    state.run.teams.reduce((n, team) => n + team.members.length, 0) + state.run.pool.length,
    state.run.teams.length,
  );
  const split = Math.ceil(state.run.teams.length / 2);
  el('draft-teams-left').replaceChildren(
    teamColumns(state.run.teams.slice(0, split), { roster: state.roster, activeIndex: teamIndex, slots: finalSizes.slice(0, split) }),
  );
  el('draft-teams-right').replaceChildren(
    teamColumns(state.run.teams.slice(split), {
      roster: state.roster,
      activeIndex: teamIndex === null ? null : teamIndex - split,
      slots: finalSizes.slice(split),
    }),
  );

  const draftControls = el('draft-controls');
  draftControls.replaceChildren();
  addUndoButton(draftControls);
  addAbandonButton(draftControls);
}

function renderResults() {
  const view = el('results-view');
  view.replaceChildren();

  const heading = document.createElement('h2');
  heading.className = 'results-heading';
  heading.textContent = 'Teams';

  const summary = document.createElement('p');
  summary.className = 'results-summary';
  const sizes = state.run.teams.map((team) => team.members.length);
  summary.textContent = sizes.every((n) => n === sizes[0])
    ? `${state.run.teams.length} teams of ${sizes[0]}`
    : `${state.run.teams.length} teams: ${sizes.join(', ')}`;

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

  view.append(heading, summary, teamColumns(state.run.teams, { roster: state.roster }), actions);
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

  moveFocusOnViewChange(finished ? 'results' : drafting ? 'draft' : running ? 'run' : 'setup');
}

// Switching views used to leave focus on a button that had just been hidden,
// which drops a keyboard user back to the top of the document with no idea
// where they are. Move it to the new view's heading instead, and only when
// the view actually changed so it never steals focus mid-typing.
let shownView = null;
function moveFocusOnViewChange(view) {
  if (view === shownView) return;
  shownView = view;
  const target = {
    setup: 'setup-view',
    run: 'turn-heading',
    draft: 'draft-heading',
    results: 'results-view',
  }[view];
  const node = el(target);
  if (!node) return;
  node.setAttribute('tabindex', '-1');
  node.focus({ preventScroll: true });
}

el('storage-notice').hidden = store.available;

el('select-all-btn').addEventListener('click', () => {
  state.present = el('select-all-btn').dataset.action === 'clear'
    ? []
    : state.roster.map((person) => person.id);
  persist();
  render();
});

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

for (const radio of document.querySelectorAll('input[name="pick-mode"]')) {
  radio.checked = radio.value === state.config.pickMode;
  radio.addEventListener('change', () => {
    state.config.pickMode = radio.value;
    // Leaving the draft behind drops any half-made captain selection, so
    // coming back to it starts clean rather than half-filled from before.
    if (radio.value !== 'draft') state.captains = [];
    render();
  });
}

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
  // While the reveal card is up, Escape and Space close it rather than
  // reaching the wheel — otherwise one keypress would dismiss the card and
  // immediately start the next spin.
  if (isRevealing()) {
    if (event.code !== 'Space' && event.key !== 'Escape') return;
    event.preventDefault();
    reveal.close();
    return;
  }
  if (event.code !== 'Space') return;
  if (event.target.matches('input, textarea, button')) return;
  if (!state.run || state.run.mode === 'draft' || isComplete(state.run)) return;
  event.preventDefault();
  spinOnce();
});

render();
