import { el } from './dom.js';
import { displayName } from './roster.js';
import { teamLabel } from './teams.js';
import { randomIndex, planSpin } from './rng.js';
import { applyPick, currentTeamIndex, picksRemaining } from './run.js';
import { renderFlanks, equaliseTeamHeights } from './team-board.js';
import { draftTeamSizes } from './draft.js';

// The wheel screen. The order matters: draw the winner, animate, reveal, apply.
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
    // One slice left: nothing to spin for, go straight to the card.
    const lastOne = state.run.pool.length === 1;

    setControlsEnabled(false);
    try {
      if (!lastOne) {
        await wheel.spinTo(planSpin(state.run.pool.length, winnerIndex).stopAngleDeg);
      }
      // Reveal before applying the pick: render() would remove the winner's
      // slice while everyone is still looking at it.
      await reveal.show(displayName(state.roster, winnerId), teamName);
    } finally {
      // Re-enabled on every path, even if the spin fails.
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
        slots: state.run.mode === 'captains'
          ? draftTeamSizes(state.present.length, state.run.teams.length, state.config.draftOrder)
          : null,
      });
      equaliseTeamHeights(el('run-view'));

      // Size the canvas last, once its neighbours are in the DOM, or its backing
      // store won't match its displayed size.
      wheel.resize();
      wheel.draw();
    },
  };
}
