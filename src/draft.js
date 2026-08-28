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
