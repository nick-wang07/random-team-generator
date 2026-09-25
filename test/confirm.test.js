import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTwoStep } from '../src/confirm.js';

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('the first press only arms', () => {
  const c = clock();
  const step = createTwoStep({ windowMs: 3000, now: c.now });
  assert.equal(step.isArmed(), false);
  assert.equal(step.press(), 'armed');
  assert.equal(step.isArmed(), true);
});

test('a second press inside the window confirms, then it starts over', () => {
  const c = clock();
  const step = createTwoStep({ windowMs: 3000, now: c.now });
  step.press();
  c.advance(2999);
  assert.equal(step.press(), 'confirmed');
  assert.equal(step.isArmed(), false);
  assert.equal(step.press(), 'armed');
});

test('a second press after the window only re-arms', () => {
  const c = clock();
  const step = createTwoStep({ windowMs: 3000, now: c.now });
  step.press();
  c.advance(3001);
  assert.equal(step.isArmed(), false);
  assert.equal(step.press(), 'armed');
  c.advance(500);
  assert.equal(step.press(), 'confirmed');
});

test('a double-click does not confirm', () => {
  const c = clock();
  const step = createTwoStep({ windowMs: 3000, minMs: 400, now: c.now });
  step.press();
  c.advance(120);
  assert.equal(step.press(), 'armed');
  // The ignored press doesn't restart the timer or disarm it.
  c.advance(300);
  assert.equal(step.press(), 'confirmed');
});
