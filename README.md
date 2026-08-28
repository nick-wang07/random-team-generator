# Random Team Generator

A wheel spinner and captain-draft tracker for splitting a Discord call into teams.

- **Wheel mode** — spin once per person; each winner joins the next team in rotation.
- **Draft mode** — captains pick their own teammates in snake or alternating order.

The roster and your check-offs are saved in the browser, so the same people are
already ticked next time.

## Running it

Open `index.html` through any static server:

    python -m http.server 8080

This is a zero-build, zero-dependency vanilla ES module app — the browser
loads `src/app.js` and its imports directly, which requires `http://`. Opening
`index.html` straight off disk (`file://`) will not work; modules are blocked
by the browser under that scheme.

## Tests

    npm test

Pure logic (`teams`, `draft`, `run`, `roster`, `rng`, `format`, `storage`) is
covered by Node's built-in test runner. The canvas wheel and the DOM wiring are
verified by hand against `docs/MANUAL-CHECKS.md`.
