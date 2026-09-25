import { undoPick, canUndo } from './run.js';

// Undo and "Back to setup", shared by every run screen. Both do nothing while
// a spin or reveal is in flight (`isBusy`).
export function createRunControls({ state, render, isBusy }) {
  function undoLast() {
    if (isBusy()) return;
    if (!state.run || !canUndo(state.run)) return;
    state.run = undoPick(state.run);
    render();
  }

  return {
    addUndo(container) {
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'secondary';
      undo.textContent = 'Undo last pick';
      undo.disabled = !canUndo(state.run);
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
