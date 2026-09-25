import { el } from './dom.js';
import { formatTeams } from './format.js';
import { teamColumns } from './team-view.js';
import { createTwoStep } from './confirm.js';

// The finished teams and the "Copy for Discord" button.
export function createResultsView({ state, render, controls }) {
  function copyButton() {
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
    return copy;
  }

  // Leaving throws the teams away, so it takes a second click to confirm.
  function backButton() {
    const LABEL = 'Back to setup';
    const confirm = createTwoStep();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'secondary';
    back.textContent = LABEL;
    back.addEventListener('click', () => {
      if (confirm.press() === 'confirmed') {
        state.run = null;
        render();
        return;
      }
      back.textContent = 'Discard teams? Click again';
      back.classList.add('is-armed');
      setTimeout(() => {
        if (confirm.isArmed()) return;
        back.textContent = LABEL;
        back.classList.remove('is-armed');
      }, confirm.windowMs + 50);
    });
    return back;
  }

  return {
    render() {
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

      const actions = document.createElement('div');
      actions.className = 'start-buttons';
      actions.append(copyButton());
      controls.addUndo(actions);
      actions.append(backButton());

      // No equaliseTeamHeights(): the flex row already levels the columns, and
      // a min-height would stop them shrinking to keep the buttons on screen.
      view.append(heading, summary, teamColumns(state.run.teams, { roster: state.roster }), actions);
    },
  };
}
