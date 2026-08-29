import { el } from './dom.js';
import { browserBackend, createStorage } from './storage.js';
import { prunePresent } from './roster.js';
import { pickRotation } from './teams.js';
import { startRun, isComplete } from './run.js';
import { createWheel } from './wheel.js';
import { createReveal } from './reveal.js';
import { createCaptainPicker } from './captain-picker.js';
import { draftSequence } from './draft.js';
import { createRosterPanel } from './roster-panel.js';
import { createSetupView } from './setup-view.js';
import { createRunControls } from './run-controls.js';
import { createRunView } from './run-view.js';
import { createDraftView } from './draft-view.js';
import { createResultsView } from './results-view.js';

// The coordinator: it owns the state, decides which of the four screens is on
// show, and hands each screen module the few things it needs. Every screen
// gets `render` rather than calling its own renderer, so a change anywhere
// always redraws the whole app from state — there is no partial-update path
// to get out of sync.

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

function persist() {
  store.save({ roster: state.roster, present: state.present, config: state.config });
}

// The error is never hidden — it shares one always-present line with the split
// preview (see .foot-status). It used to toggle `hidden`, which changed the
// height of the config panel's foot, and because subgrid pins both setup panels
// to the same three rows, that resized the ROSTER's scroll box on the other
// side of the screen: picking "Choose them" made the roster list jump 34px
// shorter, as did any other error.
function showError(message) {
  el('setup-error').textContent = message;
}

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

// A spin or a reveal in flight owns the run until it lands. Every control that
// could change the run out from under it asks this first.
const isBusy = () => wheel.isSpinning() || reveal.isRevealing();

const rosterPanel = createRosterPanel({ state, persist, render, showError });
const captainPicker = createCaptainPicker({
  dialog: el('captain-dialog'),
  title: el('captain-dialog-title'),
  count: el('captain-dialog-count'),
  chips: el('captain-chips'),
  // Picks commit as they are made, the same as the roster's own checkboxes;
  // "Done" only closes the dialog.
  onChange: (captains) => {
    state.captains = captains;
    render();
  },
});
const setupView = createSetupView({
  state,
  render,
  persist,
  rosterPanel,
  captainPicker,
  showError,
  onStartWheel: startWheelRun,
  onStartDraft: startDraft,
});
const controls = createRunControls({ state, render, isBusy });
const runView = createRunView({ state, render, wheel, reveal, controls });
const draftView = createDraftView({ state, render, controls });
const resultsView = createResultsView({ state, render, controls });

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
  // the same gesture. Starting a run abandons whatever row was mid-edit.
  rosterPanel.forgetEditor();
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
  // whatever roster row was mid-edit, so clear the editor here too.
  rosterPanel.forgetEditor();
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

  if (!running) setupView.render();
  else if (finished) resultsView.render();
  else if (drafting) draftView.render();
  else runView.render();

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

document.addEventListener('keydown', (event) => {
  // While the reveal card is up, Escape and Space close it rather than
  // reaching the wheel — otherwise one keypress would dismiss the card and
  // immediately start the next spin.
  if (reveal.isRevealing()) {
    if (event.code !== 'Space' && event.key !== 'Escape') return;
    event.preventDefault();
    reveal.close();
    return;
  }
  if (event.code !== 'Space') return;
  if (event.target.matches('input, textarea, button')) return;
  if (!state.run || state.run.mode === 'draft' || isComplete(state.run)) return;
  event.preventDefault();
  runView.spin();
});

el('storage-notice').hidden = store.available;

render();
