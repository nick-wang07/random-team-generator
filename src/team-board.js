import { teamSizes } from './teams.js';
import { currentTeamIndex } from './run.js';
import { teamColumns } from './team-view.js';

// The wheel screen and the draft board share a shape: teams down both sides,
// the thing you act on in the middle. Both render the same data the same way —
// the team about to receive the next pick is outlined, and unfilled places
// show as slots — so that lives here once rather than twice.
export function renderFlanks({ leftNode, rightNode, run, roster }) {
  const teamIndex = currentTeamIndex(run);
  // First half of the teams down the left, the rest down the right. With the
  // usual two teams that is simply A and B.
  const split = Math.ceil(run.teams.length / 2);
  // Sizes are what each team will finish with, not what it holds now, so the
  // columns show the shape of the finished teams from the very first pick.
  const finalSizes = teamSizes(
    run.teams.reduce((n, team) => n + team.members.length, 0) + run.pool.length,
    run.teams.length,
  );

  leftNode.replaceChildren(teamColumns(run.teams.slice(0, split), {
    roster,
    activeIndex: teamIndex,
    slots: finalSizes.slice(0, split),
  }));
  rightNode.replaceChildren(teamColumns(run.teams.slice(split), {
    roster,
    // Indices on the right side are offset by the teams the left side took.
    // Out of range on either side simply means no column is outlined there.
    activeIndex: teamIndex === null ? null : teamIndex - split,
    slots: finalSizes.slice(split),
  }));
}

// Team columns sit side by side, so they should read as a matched pair even
// when the teams end up different sizes — 13 people across 2 teams is a 7 and
// a 6, and the 6 renders one row shorter. Padding the short team to 7 slots
// would claim a place it never gets, so the slot counts stay honest and the
// boxes are levelled to the tallest instead.
export function equaliseTeamHeights(root) {
  const columns = [...root.querySelectorAll('.team-column')];
  if (columns.length < 2) return;
  for (const column of columns) column.style.minHeight = '';
  const tallest = Math.max(...columns.map((c) => c.getBoundingClientRect().height));
  for (const column of columns) column.style.minHeight = `${Math.ceil(tallest)}px`;
}
