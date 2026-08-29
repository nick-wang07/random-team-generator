import { findPerson } from './roster.js';
import { teamHasWalt, commiserate } from './format.js';

// Builds the team columns shared by the wheel screen, the draft board and the
// results screen. Everything it needs is passed in, so it holds no app state
// and can be rendered against any roster.
//
// `activeIndex` marks the team currently on the clock, if any — the draft
// board uses it so the board itself shows whose turn it is rather than
// leaving that to the heading alone. `slots` pads each team out to the size
// it will end up, so empty columns read as waiting rather than as broken.
export function teamColumns(teams, { roster, activeIndex = null, slots = null } = {}) {
  const nameOf = (id) => findPerson(roster, id)?.name ?? '(unknown)';

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
      li.textContent = commiserate(nameOf(id), hasWalt);
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
