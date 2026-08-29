# Random Team Generator

A wheel spinner and captain-draft tracker for splitting a Discord call into
teams. Built to be screen-shared: dark, large, and readable from a stream.

- **Wheel mode** — spin once per person; each winner joins the next team in
  rotation. The wheel holds on the winner before they leave it.
- **Captain draft** — captains are spun for or hand-picked, then take turns
  choosing teammates in snake or alternating order.

Both modes finish on a results screen with a **Copy for Discord** button that
formats the teams for pasting straight into chat.

## Using it

The roster is seeded with a set of regulars the first time you open it, all
ticked. After that your roster and who was ticked are saved in the browser, so
the same people are already selected next time.

- Click a name to rename it; Enter commits, Escape cancels.
- **Remove** takes someone off the roster permanently — the roster is the only
  thing here that outlives the session, so an **Undo** appears next to the list.
- **Select all / Clear all** flips the whole roster at once.
- A preview under the team count shows the split you are about to get
  ("2 teams of 7").

During a spin:

- **Space** spins, and **clicking the wheel** cuts the current spin short. The
  wheel lands on the same slice either way — skipping only skips the wait.
- **Undo last pick** puts the last person back on the wheel, in their original
  slice.

## Fairness

The winner of every spin is drawn *before* the wheel moves. The animation is
told which angle to stop at and travels there, so it cannot influence or
contradict the result — and cutting a spin short lands on exactly the angle a
full spin would have.

## Running it

Open `index.html` through any static server:

    python -m http.server 8080

This is a zero-build, zero-dependency vanilla ES module app — the browser loads
`src/app.js` and its imports directly, which requires `http://`. Opening
`index.html` straight off disk (`file://`) will not work; modules are blocked by
the browser under that scheme.

## How it is put together

`src/app.js` owns the state and decides which of the four screens is showing.
Everything else is either a screen or a piece of pure logic:

| | |
|---|---|
| `roster-panel`, `setup-view`, `run-view`, `draft-view`, `results-view` | one screen (or panel) each, built as `create…({ state, render, … })` |
| `wheel`, `reveal`, `team-view`, `team-board`, `run-controls`, `dom` | shared pieces the screens build with |
| `roster`, `teams`, `run`, `rng`, `draft`, `format`, `storage` | pure logic, no DOM, fully tested |

Every screen is handed `render` rather than redrawing itself, so a change
anywhere redraws the whole app from state — there is no partial-update path to
get out of sync.

## Tests

    npm test

Requires Node 20 or later (uses Node's built-in test runner). There are no
dependencies to install, including for tests.

The pure logic in the bottom row of the table above is covered by automated
tests. The canvas wheel and the screen modules have no automated coverage by
design and are verified by hand in a browser.
