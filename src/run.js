import { createTeams } from './teams.js';

export function startRun({ mode, present, teamCount, order, seeded = [] }) {
  const teams = createTeams(teamCount).map((team, i) => ({
    ...team,
    members: [...(seeded[i] ?? [])],
  }));
  const taken = new Set(seeded.flat());
  return {
    mode,
    teams,
    pool: present.filter((id) => !taken.has(id)),
    order,
    turnIndex: 0,
    history: [],
  };
}

export function isComplete(run) {
  return run.turnIndex >= run.order.length || run.pool.length === 0;
}

export function currentTeamIndex(run) {
  return isComplete(run) ? null : run.order[run.turnIndex];
}

export function picksRemaining(run) {
  return Math.min(run.order.length - run.turnIndex, run.pool.length);
}

export function applyPick(run, personId) {
  if (isComplete(run)) throw new Error('Run is already complete');
  const poolIndex = run.pool.indexOf(personId);
  if (poolIndex === -1) throw new Error(`${personId} is not in the pool`);

  const teamIndex = run.order[run.turnIndex];
  return {
    ...run,
    teams: run.teams.map((team, i) => (
      i === teamIndex ? { ...team, members: [...team.members, personId] } : team
    )),
    pool: run.pool.filter((id) => id !== personId),
    turnIndex: run.turnIndex + 1,
    history: [...run.history, { personId, teamIndex, poolIndex }],
  };
}

// Puts the person back at the pool position they left from, so the wheel
// does not reshuffle itself when someone undoes a spin.
export function undoPick(run) {
  if (run.history.length === 0) return run;
  const last = run.history[run.history.length - 1];
  const pool = [...run.pool];
  pool.splice(last.poolIndex, 0, last.personId);
  return {
    ...run,
    teams: run.teams.map((team, i) => (
      i === last.teamIndex
        ? { ...team, members: team.members.filter((id) => id !== last.personId) }
        : team
    )),
    pool,
    turnIndex: run.turnIndex - 1,
    history: run.history.slice(0, -1),
  };
}
