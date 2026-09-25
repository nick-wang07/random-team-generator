export const MIN_TEAMS = 2;
export const MAX_TEAMS = 8;

// Everyone gets floor(n / k); the first n % k teams get one extra.
export function teamSizes(n, k) {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

// A, B, A, B, ... fills exactly the sizes above.
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

// Toggles one person in or out of the captains, never growing past `limit`.
// Removal is always allowed, even over the limit.
export function toggleCaptain(captains, id, limit) {
  if (captains.includes(id)) return captains.filter((x) => x !== id);
  if (captains.length >= limit) return captains;
  return [...captains, id];
}
