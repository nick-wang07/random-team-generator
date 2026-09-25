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

// Owns the state and decides which screen is showing. Screens are handed
// `render` and never redraw themselves, so every change redraws the whole app.

const store = createStorage(browserBackend());
const loaded = store.load();

export const state = {
  roster: loaded.roster,
  present: prunePresent(loaded.roster, loaded.present),
  config: loaded.config,
  run: null,
};
// Session-only settings: storage.load() does not read these back.
state.config.captainMode = state.config.captainMode ?? 'spin';
state.config.pickMode = state.config.pickMode ?? 'wheel';
state.captains = [];

function persist() {
  store.save({ roster: state.roster, present: state.present, config: state.config });
}

// The error line is never hidden, so showing one does not resize the panels.
function showError(message) {
  el('setup-error').textContent = message;
}

const wheel = createWheel(el('wheel-canvas'));

window.addEventListener('resize', () => { wheel.resize(); wheel.draw(); });
// Cuts a spin short. It lands on the same angle, so the winner cannot change.
el('wheel-canvas').addEventListener('click', () => wheel.finish());

const reveal = createReveal({
  overlay: el('reveal-overlay'),
  nameNode: el('reveal-name'),
  teamNode: el('reveal-team'),
  closeButton: el('reveal-close'),
});

// Nothing may change the run while a spin or reveal is in flight.
const isBusy = () => wheel.isSpinning() || reveal.isRevealing();

const rosterPanel = createRosterPanel({ state, persist, render, showError });
const captainPicker = createCaptainPicker({
  dialog: el('captain-dialog'),
  title: el('captain-dialog-title'),
  count: el('captain-dialog-count'),
  chips: el('captain-chips'),
  // Picks commit live; "Done" only closes the dialog.
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
  // Starting a run abandons any rename still in progress.
  rosterPanel.forgetEditor();
  render();
}

function beginDraftFromCaptains(captainIds, previous = null) {
  const teamCount = state.config.teamCount;
  const present = [...state.present];
  state.run = startRun({
    mode: 'draft',
    present,
    teamCount,
    order: draftSequence(teamCount, present.length - teamCount, state.config.draftOrder),
    seeded: captainIds.map((id) => [id]),
    previous,
  });
  render();
}

function startDraft() {
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
    const captainRun = state.run;
    const captainIds = captainRun.teams.map((team) => team.members[0]);
    state.run = null;
    // Kept on the draft so undo can go back into the captain spins.
    beginDraftFromCaptains(captainIds, captainRun);
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

// On a view change, move focus to the new view's heading so it is not left on
// a hidden button. Only on a change, so it never steals focus mid-typing.
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
  // While the reveal is up, Space and Escape only close it, so one keypress
  // cannot dismiss the card and start the next spin.
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
