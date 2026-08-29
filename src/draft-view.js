import { el } from './dom.js';
import { displayName } from './roster.js';
import { teamLabel } from './teams.js';
import { applyPick, currentTeamIndex } from './run.js';
import { renderFlanks, equaliseTeamHeights } from './team-board.js';

// The draft board: captains take turns choosing from the pool in the middle.
export function createDraftView({ state, render, controls }) {
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

  function renderPool() {
    const pool = el('draft-pool');
    pool.replaceChildren();
    for (const id of state.run.pool) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = displayName(state.roster, id);
      button.addEventListener('click', () => {
        state.run = applyPick(state.run, id);
        render();
      });
      pool.append(button);
    }
  }

  return {
    render() {
      const teamIndex = currentTeamIndex(state.run);
      const totalPicks = state.run.order.length;
      const pickNumber = state.run.turnIndex + 1;
      el('draft-heading').textContent =
        `${teamLabel(teamIndex)} picks — pick ${pickNumber} of ${totalPicks}`;
      renderPickOrder();
      renderPool();

      renderFlanks({
        leftNode: el('draft-teams-left'),
        rightNode: el('draft-teams-right'),
        run: state.run,
        roster: state.roster,
      });

      const draftControls = el('draft-controls');
      draftControls.replaceChildren();
      controls.addUndo(draftControls);
      controls.addAbandon(draftControls);

      equaliseTeamHeights(el('draft-view'));
    },
  };
}
