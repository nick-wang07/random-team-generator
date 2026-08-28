import { findPerson } from './roster.js';

// Sharing a team with a Walt is its own punishment. Matches Walt, Walter,
// Walker, Walteezer, Waltezzer and any future spelling that keeps the front
// of the name intact.
const WALT = /^wal[tk]/i;

export function isWalt(name) {
  return WALT.test(String(name ?? '').trim());
}

export function teamHasWalt(memberIds, roster) {
  return memberIds.some((id) => isWalt(findPerson(roster, id)?.name));
}

// The Walt himself is spared — he is not on a team with a Walt, everyone
// else is.
export function commiserate(name, hasWalt) {
  return hasWalt && !isWalt(name) ? `${name} 😭` : name;
}

export function formatTeams(teams, roster) {
  return teams
    .map((team) => {
      const hasWalt = teamHasWalt(team.members, roster);
      return [
        `**${team.name}**`,
        ...team.members.map((id) => {
          const name = findPerson(roster, id)?.name ?? '(unknown)';
          return `- ${commiserate(name, hasWalt)}`;
        }),
      ].join('\n');
    })
    .join('\n\n');
}
