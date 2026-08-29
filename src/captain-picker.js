// The captain picker: a modal list of everyone in the call, where you tap the
// people who should lead a team.
//
// Like the reveal card, it is handed its nodes rather than looking them up, so
// it has no opinion about the page it lives on. It owns no state either — it
// is given the current captains whenever it opens and reports every change
// back through onChange, so `state.captains` stays the single source of truth.

import { toggleCaptain } from './teams.js';

export function createCaptainPicker({ dialog, title, count, chips, onChange }) {
  // Set between open() and close, so renderChips() can read the live values
  // without them being threaded through every call.
  let people = [];
  let captains = [];
  let limit = 0;

  function renderChips() {
    const full = captains.length >= limit;
    title.textContent = `Pick ${limit} captain${limit === 1 ? '' : 's'}`;
    // Lowering the team count after picking leaves more captains than teams.
    // "3 of 2 chosen" is technically true and reads like nonsense, so that case
    // says what to do about it instead. The chosen chips stay enabled, so it is
    // always recoverable from inside the dialog.
    const over = captains.length - limit;
    count.textContent = over > 0
      ? `${captains.length} chosen, ${over} too many`
      : `${captains.length} of ${limit} chosen`;

    chips.replaceChildren(
      ...people.map(({ id, name }) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'captain-chip';
        chip.textContent = name;
        const chosen = captains.includes(id);
        chip.setAttribute('aria-pressed', String(chosen));
        // At the limit the unchosen go quiet rather than failing on click.
        // Blocking the pick is the same rule as toggleCaptain's, said in the
        // interface instead of after the fact.
        chip.disabled = full && !chosen;
        chip.addEventListener('click', () => {
          captains = toggleCaptain(captains, id, limit);
          onChange(captains);
          renderChips();
        });
        return chip;
      }),
    );
  }

  // `people` is [{ id, name }] in roster order; `current` the captains so far.
  function open({ people: nextPeople, captains: current, limit: nextLimit }) {
    people = nextPeople;
    captains = current;
    limit = nextLimit;
    renderChips();
    dialog.showModal();
  }

  return { open };
}
