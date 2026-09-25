import { currentTeamIndex, finalTeamSizes } from './run.js';
import { teamColumns } from './team-view.js';

// The team columns either side of the wheel and the draft pool. The team
// about to receive a pick is outlined; unfilled places show as slots.
export function renderFlanks({ leftNode, rightNode, run, roster, slots = null }) {
  const teamIndex = currentTeamIndex(run);
  // First half of the teams on the left, the rest on the right.
  const split = Math.ceil(run.teams.length / 2);
  // Slots show each team's final size. The captain spins pass `slots` in,
  // since their run only covers the captains.
  const finalSizes = slots ?? finalTeamSizes(run);

  leftNode.replaceChildren(teamColumns(run.teams.slice(0, split), {
    roster,
    activeIndex: teamIndex,
    slots: finalSizes.slice(0, split),
  }));
  rightNode.replaceChildren(teamColumns(run.teams.slice(split), {
    roster,
    // Offset for the teams on the left; out of range means nothing is outlined.
    activeIndex: teamIndex === null ? null : teamIndex - split,
    slots: finalSizes.slice(split),
  }));
}

// Levels the columns to the tallest, so an uneven split (7 and 6) still
// reads as a matched pair without faking an extra slot.
export function equaliseTeamHeights(root) {
  const columns = [...root.querySelectorAll('.team-column')];
  if (columns.length < 2) return;
  for (const column of columns) column.style.minHeight = '';
  const tallest = Math.max(...columns.map((c) => c.getBoundingClientRect().height));
  for (const column of columns) column.style.minHeight = `${Math.ceil(tallest)}px`;
}
