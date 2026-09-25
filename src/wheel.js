const TAU = Math.PI * 2;
const toRad = (deg) => (deg * Math.PI) / 180;

// Slice colours: the full hue circle in OKLCH at low chroma, lightness
// alternating between two values so neighbours differ in brightness too.
// OKLCH keeps brightness even across hues (HSL did not), and 0.46/0.64 lets
// every label clear WCAG AA with one of the two text colours.
const DARK_TEXT = '#0f1116';
const LIGHT_TEXT = '#f2f4f8';
const DARK_SLICE = 0.46;
const LIGHT_SLICE = 0.64;
// A third lightness for the last slice of an odd count (see below). Darker
// rather than a midpoint, which failed AA, or brighter, which reads as a
// highlight.
const MID_SLICE = 0.34;

// The slice fill and a text colour readable on it.
function sliceColor(index, total) {
  const n = Math.max(total, 1);
  const hue = (360 / n) * index + 20;
  // With an odd count the first and last slices would both be dark and
  // adjacent, so the last one gets its own lightness. The count drops by one
  // per spin, so this happens every other spin.
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
    // Font size scales with both the radius and the label count.
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
      // A faint light divider; a dark one read as a crack.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Labels run outward along the slice's middle. Those on the left half are
      // turned 180° so no name reads upside down.
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
      // Refuse rather than disturb the spin already in flight.
      return Promise.reject(new Error('spinTo called while already spinning'));
    }

    const from = rotation;
    const distance = stopAngleDeg - from;
    spinning = true;
    canvas.classList.add('is-spinning');
    return new Promise((resolve) => {
      const started = performance.now();

      // Lands on the planned angle, whether the spin ran out or was cut short.
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

      // Cuts this spin short.
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

  // Cuts the current spin short; a no-op when nothing is spinning.
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
