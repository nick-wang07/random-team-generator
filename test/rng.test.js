import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomInt, randomIndex, planSpin, SLICE_PAD } from '../src/rng.js';

// A source that hands back fixed values in order, so every draw is pinned.
function sequence(values) {
  let i = 0;
  return () => values[i++];
}

// Which local angle ends up under the pointer for a given total rotation.
function underPointer(stopAngleDeg) {
  return (360 - (stopAngleDeg % 360)) % 360;
}

test('randomInt maps the source onto 0..max-1', () => {
  assert.equal(randomInt(4, () => 0), 0);
  assert.equal(randomInt(4, () => 0.5), 2);
  assert.equal(randomInt(4, () => 0.999), 3);
});

test('randomIndex stays within the array bounds', () => {
  assert.equal(randomIndex(['a', 'b', 'c'], () => 0), 0);
  assert.equal(randomIndex(['a', 'b', 'c'], () => 0.999), 2);
});

test('planSpin computes an exact stop angle', () => {
  // 4 slices of 90 degrees. Winner is slice 1, fraction 0.5, so the target is
  // 90 * (1 + 0.1 + 0.8 * 0.5) = 135 degrees, and 4 full spins are added.
  const plan = planSpin(4, 1, sequence([0.5, 0]));
  assert.equal(plan.sliceAngle, 90);
  assert.equal(plan.targetLocalDeg, 135);
  assert.equal(plan.fullSpins, 4);
  assert.equal(plan.stopAngleDeg, 1440 + 225);
});

test('the pointer always lands inside the winning slice, never on a divider', () => {
  const sliceCount = 12;
  const sliceAngle = 360 / sliceCount;
  for (const fraction of [0, 0.25, 0.5, 0.75, 0.999]) {
    for (let winner = 0; winner < sliceCount; winner++) {
      const { stopAngleDeg } = planSpin(sliceCount, winner, sequence([fraction, 0]));
      const local = underPointer(stopAngleDeg);
      assert.equal(Math.floor(local / sliceAngle), winner, `winner ${winner} at ${fraction}`);
      const offsetInSlice = local - winner * sliceAngle;
      assert.ok(offsetInSlice >= sliceAngle * SLICE_PAD - 1e-9, 'too close to the leading edge');
      assert.ok(offsetInSlice <= sliceAngle * (1 - SLICE_PAD) + 1e-9, 'too close to the trailing edge');
    }
  }
});

test('the same winner lands somewhere different each spin', () => {
  const a = planSpin(6, 2, sequence([0.1, 0]));
  const b = planSpin(6, 2, sequence([0.9, 0]));
  assert.notEqual(a.stopAngleDeg, b.stopAngleDeg);
});

test('full spins stay between 4 and 6', () => {
  assert.equal(planSpin(6, 0, sequence([0, 0])).fullSpins, 4);
  assert.equal(planSpin(6, 0, sequence([0, 0.5])).fullSpins, 5);
  assert.equal(planSpin(6, 0, sequence([0, 0.999])).fullSpins, 6);
});

test('a single slice still produces a valid spin', () => {
  const { stopAngleDeg } = planSpin(1, 0, sequence([0.5, 0]));
  assert.ok(Number.isFinite(stopAngleDeg));
  assert.equal(Math.floor(underPointer(stopAngleDeg) / 360), 0);
});
