import { displayName } from './roster.js';
import { teamHasWalt, commiserate } from './format.js';

// Team columns for the wheel, draft and results screens. `activeIndex`
// outlines the team whose turn it is; `slots` pads each team with empty rows
// up to its final size.
export function teamColumns(teams, { roster, activeIndex = null, slots = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'team-columns';

  for (const [index, team] of teams.entries()) {
    const col = document.createElement('div');
    col.className = index === activeIndex ? 'team-column is-active' : 'team-column';

    const heading = document.createElement('h3');
    heading.textContent = `${team.name} (${team.members.length})`;

    const hasWalt = teamHasWalt(team.members, roster);
    const list = document.createElement('ul');
    list.append(...team.members.map((id) => {
      const li = document.createElement('li');
      li.textContent = commiserate(displayName(roster, id), hasWalt);
      return li;
    }));

    const target = slots ? slots[index] : 0;
    for (let i = team.members.length; i < target; i += 1) {
      const li = document.createElement('li');
      li.className = 'slot-empty';
      li.textContent = '—';
      list.append(li);
    }

    col.append(heading, list);
    wrap.append(col);
  }
  return wrap;
}
