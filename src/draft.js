export const DRAFT_ORDERS = ['snake', 'alternating'];

export function draftSequence(teamCount, pickCount, order) {
  if (!DRAFT_ORDERS.includes(order)) {
    throw new Error(`Unknown draft order: ${order}`);
  }
  const sequence = [];
  for (let round = 0; sequence.length < pickCount; round++) {
    const forward = order === 'alternating' || round % 2 === 0;
    for (let i = 0; i < teamCount && sequence.length < pickCount; i++) {
      sequence.push(forward ? i : teamCount - 1 - i);
    }
  }
  return sequence;
}

// Final team sizes for a captain draft. Unlike teamSizes(), snake order can
// give the extra player to a later team.
export function draftTeamSizes(peopleCount, teamCount, order) {
  const sizes = new Array(teamCount).fill(1);
  for (const t of draftSequence(teamCount, peopleCount - teamCount, order)) sizes[t] += 1;
  return sizes;
}
