// Modal list of everyone in the call; tap people to make them captains.
// Holds no state of its own: it is given the captains on open and reports
// every change through onChange.

import { toggleCaptain } from './teams.js';

export function createCaptainPicker({ dialog, title, count, chips, onChange }) {
  let people = [];
  let captains = [];
  let limit = 0;

  function renderChips() {
    const full = captains.length >= limit;
    title.textContent = `Pick ${limit} captain${limit === 1 ? '' : 's'}`;
    // Lowering the team count after picking can leave too many captains.
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
        // At the limit, unchosen chips disable; chosen ones stay clickable.
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

  // `people` is [{ id, name }] in roster order.
  function open({ people: nextPeople, captains: current, limit: nextLimit }) {
    people = nextPeople;
    captains = current;
    limit = nextLimit;
    renderChips();
    dialog.showModal();
  }

  return { open };
}
