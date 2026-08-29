const TAU = Math.PI * 2;
const toRad = (deg) => (deg * Math.PI) / 180;

// Slice colours: the whole hue circle at low chroma, with lightness
// alternating so neighbours separate by brightness as well as hue.
//
// The wheel used to be `hsl(hue 62% 46%)` — one HSL lightness for every hue.
// HSL lightness is not perceptual, so actual luminance ran from 0.076 (blue)
// to 0.434 (yellow-green), a 5.7x spread: some slices glared and others sank.
// Worse, every label was painted dark regardless, leaving 7 of 14 slices below
// WCAG AA. The names on the blues were the ones nobody could read.
//
// OKLCH is perceptually uniform, so a fixed lightness really is a fixed
// brightness. The alternation is deliberately wide: 0.50/0.58 measured
// beautifully even and STILL failed AA on five slices, because perfect
// evenness parks every slice in the mid zone where neither black nor white
// text is comfortable. 0.46/0.64 gives every slice a text colour at 5.3:1 or
// better, which is the whole point of alternating rather than flattening.
const DARK_TEXT = '#0f1116';
const LIGHT_TEXT = '#f2f4f8';
const DARK_SLICE = 0.46;
const LIGHT_SLICE = 0.64;
// Only used at an odd count's wrap-around, below. Deliberately darker than
// DARK_SLICE rather than a midpoint between the two: a true midpoint (0.55)
// sat in the zone where neither text colour is comfortable and measured 4.42:1
// at n=3, the one slice in the whole scheme to miss AA. Going darker instead of
// brighter keeps it discreet — a slice brighter than every other would read as
// a highlight and imply a meaning the wheel does not have.
const MID_SLICE = 0.34;

// Returns the slice fill and the text colour that survives on it. Text follows
// the slice's own lightness rather than being measured back off the canvas.
function sliceColor(index, total) {
  const n = Math.max(total, 1);
  const hue = (360 / n) * index + 20;
  // With an odd count the alternation wraps onto itself: the last slice and
  // the first are both "dark" and sit side by side, so that one seam loses the
  // brightness cue every other pair gets. A third lightness there differs from
  // both of its neighbours. The count is the number of names still on the
  // wheel, so it drops by one per spin — half of every game is an odd count,
  // and this is not a rare edge.
  let lightness;
  if (n % 2 === 1 && index === n - 1) lightness = MID_SLICE;
  else lightness = index % 2 ? LIGHT_SLICE : DARK_SLICE;

  return {
    fill: `oklch(${lightness} 0.075 ${hue})`,
    text: lightness >= LIGHT_SLICE ? DARK_TEXT : LIGHT_TEXT,
  };
}

export function createWheel(canvas) {
  const ctx = canvas.getContext('2d');
  let labels = [];
  let rotation = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth || 600;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawPointer(cx, radius) {
    ctx.save();
    ctx.fillStyle = '#f2f4f8';
    ctx.beginPath();
    ctx.moveTo(cx, 8);
    ctx.lineTo(cx - 16, 8 - 22);
    ctx.lineTo(cx + 16, 8 - 22);
    ctx.closePath();
    ctx.fill();
    // A second triangle pointing down into the wheel makes the tip unambiguous.
    ctx.beginPath();
    ctx.moveTo(cx, 8 + 26);
    ctx.lineTo(cx - 16, 8);
    ctx.lineTo(cx + 16, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.width / dpr;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 30;

    ctx.clearRect(0, 0, size, size);

    if (labels.length === 0) {
      drawPointer(cx, radius);
      return;
    }

    const sliceAngle = 360 / labels.length;
    // Cap and per-label budget both scale down with the wheel's actual
    // radius, not just the label count — at the reference 600px canvas
    // (radius 270) this reproduces the original max(14, min(28, 520/n))
    // exactly; on the narrower canvases the responsive CSS width allows
    // (down to ~320px, radius ~130) it shrinks further so long names stop
    // overrunning the hub.
    const radiusScale = radius / 270;
    const fontSize = Math.max(14, Math.min(28 * radiusScale, (520 * radiusScale) / labels.length));

    labels.forEach((label, i) => {
      const start = toRad(rotation + i * sliceAngle - 90);
      const end = toRad(rotation + (i + 1) * sliceAngle - 90);

      const { fill, text } = sliceColor(i, labels.length);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      // A hairline of light rather than a 2px gouge of near-black: the dark
      // divider read as a crack between slices at any size.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text runs along the middle of the slice, reading outward. This does
      // not change slice geometry at all — `start`/`end` above are untouched
      // — it only changes which way the label text is drawn. A slice whose
      // midpoint falls on the wheel's left half would otherwise render its
      // label upside down (screen-shared, half the names would read
      // backwards), so those get an extra 180° rotation, with the anchor and
      // alignment mirrored to match, keeping every label reading
      // left-to-right all the way around.
      const midAngleDeg = rotation + (i + 0.5) * sliceAngle - 90;
      const normalizedMid = ((midAngleDeg % 360) + 360) % 360;
      const flipped = normalizedMid > 90 && normalizedMid < 270;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(toRad(flipped ? midAngleDeg + 180 : midAngleDeg));
      ctx.textAlign = flipped ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = text;
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.fillText(label, flipped ? -(radius - 16) : radius - 16, 0);
      ctx.restore();
    });

    // Rim, so the wheel sits on the background instead of floating over it.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.strokeStyle = '#2f3442';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 28, 0, TAU);
    ctx.fillStyle = '#1e212b';
    ctx.fill();
    ctx.strokeStyle = '#2f3442';
    ctx.lineWidth = 3;
    ctx.stroke();

    drawPointer(cx, radius);
  }

  const SPIN_MS = 4000;
  let spinning = false;
  let frameId = null;
  let finishActive = null;

  // Cubic ease-out: fast off the line, creeping into the final degree.
  function easeOut(t) {
    return 1 - (1 - t) ** 3;
  }

  function spinTo(stopAngleDeg, durationMs = SPIN_MS) {
    if (spinning) {
      // Refuse rather than touch the in-flight spin: resolving or cancelling
      // someone else's promise on their behalf is exactly how a second
      // caller (e.g. a future captain-draft spin) could apply a pick whose
      // animation never actually landed. app.js's spinOnce() already checks
      // isSpinning() before calling, so this path is unreachable there — it
      // exists so wheel.js defends its own invariant no matter who calls it.
      return Promise.reject(new Error('spinTo called while already spinning'));
    }

    const from = rotation;
    const distance = stopAngleDeg - from;
    spinning = true;
    canvas.classList.add('is-spinning');
    return new Promise((resolve) => {
      const started = performance.now();

      // Lands the spin on the angle it was always going to stop at. Whether
      // it gets here by running out of time or by someone cutting it short,
      // the resting angle is identical — the winner was drawn before any of
      // this started and nothing here can move it.
      function settle() {
        // Normalise so the next spin's 4-to-6 turns start from a small angle.
        rotation = ((stopAngleDeg % 360) + 360) % 360;
        draw();
        spinning = false;
        frameId = null;
        finishActive = null;
        canvas.classList.remove('is-spinning');
        resolve();
      }

      // Resolves THIS spin's own promise, never another caller's — that
      // distinction is what keeps `finish` safe where superseding was not.
      finishActive = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        settle();
      };

      function frame(now) {
        const t = Math.min(1, (now - started) / durationMs);
        rotation = from + distance * easeOut(t);
        draw();
        if (t < 1) {
          frameId = requestAnimationFrame(frame);
        } else {
          settle();
        }
      }
      frameId = requestAnimationFrame(frame);
    });
  }

  // Cuts the current spin short. A no-op when nothing is spinning, so callers
  // can wire it straight to a click without guarding.
  function finish() {
    if (finishActive) finishActive();
  }

  return {
    setSlices(next) { labels = [...next]; },
    resize,
    draw,
    spinTo,
    finish,
    isSpinning: () => spinning,
  };
}
