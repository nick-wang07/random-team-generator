// The card announcing a spin's winner. Knows nothing about runs or teams.

const REVEAL_MS = 2500;

export function createReveal({ overlay, nameNode, teamNode, closeButton }) {
  // Non-null while a card is up.
  let closeActive = null;

  function isRevealing() {
    return closeActive !== null;
  }

  // Resolves (never rejects) when the card is dismissed by the timer, the X,
  // the backdrop, or close().
  function show(name, teamName) {
    nameNode.textContent = name;
    teamNode.textContent = `joins ${teamName}`;
    overlay.hidden = false;

    return new Promise((resolve) => {
      // Per call, so a second dismiss of this card is always a no-op.
      let done = false;
      const timer = setTimeout(dismiss, REVEAL_MS);

      function dismiss() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        closeActive = null;
        overlay.hidden = true;
        overlay.removeEventListener('click', onBackdrop);
        closeButton.removeEventListener('click', dismiss);
        resolve();
      }

      function onBackdrop(event) {
        // The backdrop only, not clicks inside the card.
        if (event.target === overlay) dismiss();
      }

      closeActive = dismiss;
      overlay.addEventListener('click', onBackdrop);
      closeButton.addEventListener('click', dismiss);
    });
  }

  // Closes the card early; a no-op when none is showing.
  function close() {
    if (closeActive) closeActive();
  }

  return { show, close, isRevealing };
}
