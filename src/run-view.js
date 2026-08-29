import { el } from './dom.js';
import { displayName } from './roster.js';
import { teamLabel } from './teams.js';
import { randomIndex, planSpin } from './rng.js';
import { applyPick, currentTeamIndex, picksRemaining } from './run.js';
import { renderFlanks, equaliseTeamHeights } from './team-board.js';

// The wheel screen. Owns the one thing in this app that has to be exactly
// right — the order in which a pick is drawn, animated, revealed and applied.
export function createRunView({ state, render, wheel, reveal, controls }) {
  function setControlsEnabled(enabled) {
    for (const button of el('run-controls').querySelectorAll('button')) {
      button.disabled = !enabled;
    }
  }

  async function spin() {
    if (wheel.isSpinning() || reveal.isRevealing()) return;

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
      await reveal.show(displayName(state.roster, winnerId), teamName);
    } finally {
      // Restored on every path, including a rejected/aborted spin, so a
      // failure never leaves the controls stuck disabled with the winner
      // already drawn but nowhere applied.
      setControlsEnabled(true);
    }

    state.run = applyPick(state.run, winnerId);
    render();
  }

  return {
    spin,

    render() {
      const teamName = teamLabel(currentTeamIndex(state.run));
      el('turn-heading').textContent = state.run.mode === 'captains'
        ? `Spinning for ${teamName}'s captain`
        : `Spinning for ${teamName}`;

      wheel.setSlices(state.run.pool.map((id) => displayName(state.roster, id)));

      const controlBar = el('run-controls');
      controlBar.replaceChildren();
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.textContent = state.run.pool.length === 1
        ? 'Reveal the last one'
        : `Spin (${picksRemaining(state.run)} left)`;
      pick.addEventListener('click', spin);
      controlBar.append(pick);
      controls.addUndo(controlBar);
      controls.addAbandon(controlBar);

      renderFlanks({
        leftNode: el('run-teams-left'),
        rightNode: el('run-teams-right'),
        run: state.run,
        roster: state.roster,
      });
      equaliseTeamHeights(el('run-view'));

      // Sized last, once the controls and the team columns are in the DOM:
      // measuring before its neighbours exist gives the canvas a backing store
      // that doesn't match the size it ends up displayed at.
      wheel.resize();
      wheel.draw();
    },
  };
}
