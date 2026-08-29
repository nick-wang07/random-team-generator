// The reveal card: the moment a spin pays off. Knows nothing about runs,
// teams or the roster — it is handed two strings and told to hold the screen
// until someone is done reading them.
//
// Like every other view module here, it is handed its nodes rather than
// looking them up, so it has no opinion about the page it lives on.

const REVEAL_MS = 2500;

export function createReveal({ overlay, nameNode, teamNode, closeButton }) {
  // Set while a card is up, so callers can tell whether a keypress should
  // close the card instead of doing whatever it normally does.
  let closeActive = null;

  function isRevealing() {
    return closeActive !== null;
  }

  // Resolves once the card is dismissed — by the timer, the close button, a
  // click on the backdrop, or a caller calling close(). Always resolves,
  // never rejects, so an awaiting caller can never lose its pick.
  function show(name, teamName) {
    nameNode.textContent = name;
    teamNode.textContent = `joins ${teamName}`;
    overlay.hidden = false;

    return new Promise((resolve) => {
      // Per-call, so idempotency never depends on the shared `closeActive`
      // still pointing at this particular dismiss.
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
        // Only the backdrop itself — a click inside the card must not close it.
        if (event.target === overlay) dismiss();
      }

      closeActive = dismiss;
      overlay.addEventListener('click', onBackdrop);
      closeButton.addEventListener('click', dismiss);
    });
  }

  // Closes the card early. A no-op when nothing is showing, so callers can
  // wire it to a key handler without guarding.
  function close() {
    if (closeActive) closeActive();
  }

  return { show, close, isRevealing };
}
