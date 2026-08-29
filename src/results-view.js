import { el } from './dom.js';
import { formatTeams } from './format.js';
import { teamColumns } from './team-view.js';

// The finished teams, plus the button this whole app exists to serve: one
// click to get the result into a Discord message.
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

      const again = document.createElement('button');
      again.type = 'button';
      again.className = 'secondary';
      again.textContent = 'Back to setup';
      again.addEventListener('click', () => { state.run = null; render(); });

      const actions = document.createElement('div');
      actions.className = 'start-buttons';
      actions.append(copyButton());
      controls.addUndo(actions);
      actions.append(again);

      // No equaliseTeamHeights() here, unlike the wheel and draft screens:
      // both columns share one flex row, so they already stretch to match.
      // Writing a min-height would also stop them shrinking, which is what
      // keeps the buttons on screen when the teams are long.
      view.append(heading, summary, teamColumns(state.run.teams, { roster: state.roster }), actions);
    },
  };
}
