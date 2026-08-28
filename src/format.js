import { findPerson } from './roster.js';

export function formatTeams(teams, roster) {
  return teams
    .map((team) => [
      `**${team.name}**`,
      ...team.members.map((id) => `- ${findPerson(roster, id)?.name ?? '(unknown)'}`),
    ].join('\n'))
    .join('\n\n');
}
