import { el } from './dom.js';
import { displayName } from './roster.js';
import { validateSetup, teamSizes } from './teams.js';

// The setup screen's right-hand column: how many teams, which mode, the
// captain options, and the two start buttons. The roster panel down the left
// is its own module; this one only borrows `openEditorError()` from it, to
// know whether the shared error line is already spoken for.
export function createSetupView({
  state, render, persist, rosterPanel, captainPicker, showError, onStartWheel, onStartDraft,
}) {
  function validateDraftSetup() {
    const base = validateSetup({
      presentCount: state.present.length,
      teamCount: state.config.teamCount,
    });
    if (!base.ok) return base;
    if (state.config.captainMode === 'choose' && state.captains.length !== state.config.teamCount) {
      return {
        ok: false,
        reason: `Pick exactly ${state.config.teamCount} captains (${state.captains.length} selected)`,
      };
    }
    return { ok: true };
  }

  // What the panel shows for "Choose them" is the answer, not the picker: who
  // is currently a captain, and a way back into the dialog to change it.
  function renderCaptainSummary() {
    const choosing = state.config.captainMode === 'choose';
    el('captain-summary').hidden = !choosing;
    if (!choosing) return;
    const names = state.captains.map((id) => displayName(state.roster, id));
    el('captain-names').textContent = names.length
      ? names.join(', ')
      : 'No captains chosen yet';
    // Muted while empty so the panel does not read as though something is
    // already settled when nothing has been picked.
    el('captain-names').classList.toggle('is-empty', names.length === 0);
  }

  el('choose-captains-btn').addEventListener('click', () => {
    captainPicker.open({
      people: state.present.map((id) => ({ id, name: displayName(state.roster, id) })),
      captains: state.captains,
      limit: state.config.teamCount,
    });
  });

  // "2 teams of 4", or "3 teams: 4, 3, 3" when it does not divide evenly, so
  // the host can sanity-check the team count before committing to it.
  function splitPreview() {
    const present = state.present.length;
    const teamCount = state.config.teamCount;
    if (!validateSetup({ presentCount: present, teamCount }).ok) return '';
    const sizes = teamSizes(present, teamCount);
    return sizes.every((n) => n === sizes[0])
      ? `${teamCount} teams of ${sizes[0]}`
      : `${teamCount} teams: ${sizes.join(', ')}`;
  }

  el('team-count').addEventListener('input', () => {
    const raw = el('team-count').value;
    // An empty field (host clearing the box to retype) is not "0 teams" — bail
    // out without persisting or re-rendering so the host can keep typing.
    // renderSetup() would otherwise write "0" straight back into the field on
    // the next render, and a refresh mid-edit would reopen the app looking
    // broken with 0 teams saved.
    if (raw === '') return;
    state.config.teamCount = Number(raw);
    persist();
    render();
  });

  for (const radio of document.querySelectorAll('input[name="pick-mode"]')) {
    radio.checked = radio.value === state.config.pickMode;
    radio.addEventListener('change', () => {
      state.config.pickMode = radio.value;
      // Leaving the draft behind drops any half-made captain selection, so
      // coming back to it starts clean rather than half-filled from before.
      if (radio.value !== 'draft') state.captains = [];
      render();
    });
  }

  for (const radio of document.querySelectorAll('input[name="draft-order"]')) {
    radio.checked = radio.value === state.config.draftOrder;
    radio.addEventListener('change', () => {
      state.config.draftOrder = radio.value;
      persist();
      render();
    });
  }

  for (const radio of document.querySelectorAll('input[name="captain-mode"]')) {
    radio.checked = radio.value === state.config.captainMode;
    radio.addEventListener('change', () => {
      state.config.captainMode = radio.value;
      state.captains = [];
      render();
    });
  }

  el('start-wheel-btn').addEventListener('click', onStartWheel);
  el('start-draft-btn').addEventListener('click', onStartDraft);

  return {
    render() {
      // Drop any captain who is no longer present (unchecked from the roster).
      state.captains = state.captains.filter((id) => state.present.includes(id));

      rosterPanel.render();
      renderCaptainSummary();
      el('team-count').value = String(state.config.teamCount);
      const check = validateSetup({
        presentCount: state.present.length,
        teamCount: state.config.teamCount,
      });
      // An unresolved editor error takes priority over the team-count message so
      // an incidental re-render (checkbox, add, team count) doesn't erase it.
      const editorError = rosterPanel.openEditorError();
      showError(editorError ?? (check.ok ? '' : check.reason));

      // Everything specific to the draft — pick order and the captain options —
      // stays out of sight until the draft is the chosen mode, and only the
      // start button for the chosen mode is offered.
      const drafting = state.config.pickMode === 'draft';
      el('draft-config').hidden = !drafting;
      el('start-wheel-btn').hidden = drafting;
      el('start-draft-btn').hidden = !drafting;

      el('split-preview').textContent = splitPreview();

      el('start-wheel-btn').disabled = !check.ok;
      const draftCheck = validateDraftSetup();
      el('start-draft-btn').disabled = !draftCheck.ok;
      // Same priority as above: an unresolved editor error must not be clobbered
      // by the draft-specific message on an incidental re-render either. The
      // draft's own complaint is only relevant while the draft is on screen.
      if (drafting && check.ok && !draftCheck.ok && !editorError) {
        showError(draftCheck.reason);
      }
    },
  };
}
