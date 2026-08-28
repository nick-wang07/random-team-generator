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

      // Text runs along the middle of the slice, reading outward.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(toRad(rotation + (i + 0.5) * sliceAngle - 90));
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0f1116';
      ctx.font = `600 ${Math.max(14, Math.min(28, 520 / labels.length))}px system-ui, sans-serif`;
      ctx.fillText(label, radius - 16, 0);
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
  // The in-flight animation frame and the resolver for the spin currently
  // running, so a second spinTo() call (no caller today does this — app.js
  // guards with isSpinning() first — but a future caller might not) can
  // cancel the stale loop instead of letting two loops fight over `rotation`.
  let activeFrame = null;
  let resolveActive = null;

  // Cubic ease-out: fast off the line, creeping into the final degree.
  function easeOut(t) {
    return 1 - (1 - t) ** 3;
  }

  function spinTo(stopAngleDeg, durationMs = SPIN_MS) {
    if (spinning) {
      // Supersede the stale spin: stop its loop from writing `rotation` out
      // from under this one, and let its caller's await settle rather than
      // hang forever.
      cancelAnimationFrame(activeFrame);
      resolveActive();
    }

    const from = rotation;
    const distance = stopAngleDeg - from;
    spinning = true;
    return new Promise((resolve) => {
      resolveActive = resolve;
      const started = performance.now();
      function frame(now) {
        const t = Math.min(1, (now - started) / durationMs);
        rotation = from + distance * easeOut(t);
        draw();
        if (t < 1) {
          activeFrame = requestAnimationFrame(frame);
        } else {
          // Normalise so the next spin's 4-to-6 turns start from a small angle.
          rotation = ((stopAngleDeg % 360) + 360) % 360;
          draw();
          spinning = false;
          activeFrame = null;
          resolveActive = null;
          resolve();
        }
      }
      activeFrame = requestAnimationFrame(frame);
    });
  }

  return {
    setSlices(next) { labels = [...next]; },
    setRotation(deg) { rotation = deg; },
    getRotation() { return rotation; },
    resize,
    draw,
    spinTo,
    isSpinning: () => spinning,
  };
}
