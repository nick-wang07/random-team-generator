# Random Team Generator

A wheel spinner and captain-draft board for splitting a Discord call into
teams. Dark, large and readable over a screen share.

- **Wheel:** spin once per person. Each winner joins the next team in
  rotation (A, B, A, B…), so the first teams get any extra players.
- **Captain draft:** captains are spun for or chosen by hand, then pick
  teammates in snake (A B B A) or alternating (A B A B) order.

Both end on a results screen with **Copy for Discord**, which copies the teams
as a ready-to-paste message.

## Using it

Every page load starts with the default list of regulars, all ticked. Changes
to the roster (adds, renames, removals, ticks) last until you refresh. Only the
team count and the draft pick order are saved between visits.

- Click a name to rename it. Enter saves, Escape cancels.
- New names are added ticked.
- **Remove** and **Reset to default list** can both be undone from the notice
  that appears, until you make another change.
- **Select all / Clear all** ticks or unticks everyone.
- The line under the options previews the split, e.g. "2 teams of 7" or
  "2 teams: 6, 7" (in a snake draft the extra player can land on a later team).

During a spin:

- **Space** spins. **Clicking the wheel** skips to the end of the spin.
- **Undo last pick** puts the last person back in their old slice. In a draft
  it keeps going past the first pick, back into the captain spins.
- **Back to setup** on the results screen asks for a second click, since it
  throws the teams away.

## Fairness

Each winner is drawn before the wheel moves, and the wheel is animated to that
slice. Skipping the animation lands on the same slice, so it cannot change the
result.

## Running it

    npm start

Then open <http://localhost:8777>. If that port is taken, use another one
(`npm start -- 8778`); on Windows, `npm run serve:who` shows which process is
holding 8777.

It's a zero-build, zero-dependency app: the browser loads `src/app.js` as an ES
module, which requires `http://`, so opening `index.html` from disk won't work.
`scripts/serve.js` is a small static server that sends `Cache-Control:
no-store` (so CSS edits show up on reload), listens only on this machine, and
serves only the app's own files (never `.git` or the rest of the repo).
Any static server will do.

## Code layout

`src/app.js` owns the state and picks which screen is showing. Screens never
redraw themselves: they call `render()`, which redraws the whole app from state.

| | |
|---|---|
| `roster-panel`, `setup-view`, `run-view`, `draft-view`, `results-view` | one screen or panel each |
| `wheel`, `reveal`, `captain-picker`, `team-view`, `team-board`, `run-controls`, `dom` | shared UI pieces |
| `roster`, `teams`, `run`, `rng`, `draft`, `format`, `storage`, `confirm` | pure logic, no DOM, unit tested |

## Tests

    npm test

Needs Node 20+ (built-in test runner); there's nothing to install. The pure
logic and the dev server are tested; the wheel and screens are checked by
hand in a browser.
