import { undoPick } from './run.js';

// The two buttons every run screen ends with — the wheel, the draft board and
// the results all use these. `isBusy()` reports whether a spin or a reveal is
// in flight: whatever is in flight owns the run until it lands, and neither
// button may pull the state out from under it.
export function createRunControls({ state, render, isBusy }) {
  function undoLast() {
    if (isBusy()) return;
    if (!state.run || state.run.history.length === 0) return;
    state.run = undoPick(state.run);
    render();
  }

  return {
    addUndo(container) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'secondary';
      undo.textContent = 'Undo last pick';
      undo.disabled = state.run.history.length === 0;
      undo.addEventListener('click', undoLast);
      container.append(undo);
    },

    addAbandon(container) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'secondary';
      back.textContent = 'Back to setup';
      back.addEventListener('click', () => {
        if (isBusy()) return;
        state.run = null;
        render();
      });
      container.append(back);
    },
  };
}
