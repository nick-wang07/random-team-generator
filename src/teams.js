export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;

// Everyone gets floor(n / k); the first n % k teams get one extra.
export function teamSizes(n, k) {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// A, B, A, B, ... fills exactly the sizes above, because the remainder is
// front-loaded onto the same teams the rotation reaches first.
export function pickRotation(n, k) {
  return Array.from({ length: n }, (_, i) => i % k);
}

export function teamLabel(index) {
  return `Team ${String.fromCharCode(65 + index)}`;
}

export function createTeams(k) {
  return Array.from({ length: k }, (_, i) => ({ name: teamLabel(i), members: [] }));
}

export function validateSetup({ presentCount, teamCount }) {
  if (!Number.isInteger(teamCount) || teamCount < MIN_TEAMS || teamCount > MAX_TEAMS) {
    return { ok: false, reason: `Teams must be between ${MIN_TEAMS} and ${MAX_TEAMS}` };
  }
  if (presentCount < 2) {
    return { ok: false, reason: 'Need at least 2 people' };
  }
  if (presentCount < teamCount) {
    return { ok: false, reason: `Need at least ${teamCount} people for ${teamCount} teams` };
  }
  return { ok: true };
}

// Toggle one person in or out of the captain set, refusing to grow it past
// `limit`. Returns a new array; never mutates the one it is handed.
//
// Removal is always allowed, including when the set is already full — the
// picker disables the unchosen chips at the limit, so if removal were blocked
// too a complete set would be frozen with no way back.
export function toggleCaptain(captains, id, limit) {
  if (captains.includes(id)) return captains.filter((x) => x !== id);
  if (captains.length >= limit) return captains;
  return [...captains, id];
}
