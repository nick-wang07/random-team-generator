// Two-click confirmation: the first press arms, a second press within
// `windowMs` confirms. A second press sooner than `minMs` is ignored, so an
// accidental double-click can't confirm. Anything later starts over.
export function createTwoStep({ windowMs = 3000, minMs = 400, now = Date.now } = {}) {
  let armedAt = null;
  const isArmed = () => armedAt !== null && now() - armedAt <= windowMs;
  return {
    windowMs,
    isArmed,
    // Returns 'armed' or 'confirmed'.
    press() {
      if (isArmed()) {
        if (now() - armedAt < minMs) return 'armed';
        armedAt = null;
        return 'confirmed';
      }
      armedAt = now();
      return 'armed';
    },
  };
}
