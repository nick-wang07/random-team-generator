export const SLICE_PAD = 0.1;
export const MIN_FULL_SPINS = 4;
export const MAX_FULL_SPINS = 6;

export function randomInt(maxExclusive, source = Math.random) {
  return Math.floor(source() * maxExclusive);
}

export function randomIndex(array, source = Math.random) {
  return randomInt(array.length, source);
}

// Draws twice: where inside the winning slice to stop, then how many full
// spins to add. The winner itself is chosen by the caller before this runs.
export function planSpin(sliceCount, winnerIndex, source = Math.random) {
  const sliceAngle = 360 / sliceCount;
  const fraction = source();
  const usableSpan = 1 - SLICE_PAD * 2;
  const targetLocalDeg = sliceAngle * (winnerIndex + SLICE_PAD + usableSpan * fraction);
  const fullSpins = MIN_FULL_SPINS + randomInt(MAX_FULL_SPINS - MIN_FULL_SPINS + 1, source);
  const stopAngleDeg = fullSpins * 360 + ((360 - (targetLocalDeg % 360)) % 360);
  return { sliceAngle, targetLocalDeg, fullSpins, stopAngleDeg };
}
