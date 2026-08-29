const TAU = Math.PI * 2;
const toRad = (deg) => (deg * Math.PI) / 180;

// Evenly spaced hues keep neighbouring slices distinguishable at any count.
function sliceColor(index, total) {
  const hue = Math.round((360 / Math.max(total, 1)) * index);
  return `hsl(${hue} 62% 46%)`;
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

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = sliceColor(i, labels.length);
      ctx.fill();
      ctx.strokeStyle = '#14161c';
      ctx.lineWidth = 2;
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
      ctx.fillStyle = '#0f1116';
      ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
      ctx.fillText(label, flipped ? -(radius - 16) : radius - 16, 0);
      ctx.restore();
    });

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
    setRotation(deg) { rotation = deg; },
    getRotation() { return rotation; },
    resize,
    draw,
    spinTo,
    finish,
    isSpinning: () => spinning,
  };
}
