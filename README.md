# Random Team Generator

Splits a Discord call into teams, built to be screen-shared: dark, large and
readable over a stream. Two ways to pick:

- **Wheel:** spin once per person. Each winner joins the next team in rotation
  (A, B, A, B…), so any extra players land on the first teams.
- **Captain draft:** captains are spun for or chosen by hand, then take turns
  picking teammates in snake (A B B A) or alternating (A B A B) order.

Both end on a results screen with **Copy for Discord**, which copies the teams
as a ready-to-paste message.

## Quick start

Needs Node 20 or later. There is nothing to install.

    npm start

Open <http://localhost:8777>. If the port is taken, pass another
(`npm start -- 8778`); on Windows, `npm run serve:who` shows what is holding
8777.

The app is plain ES modules with no build step, so it has to be served over
`http://`; opening `index.html` from disk won't work.

## Using it

### Setup

- Every page load starts with the default roster, everyone ticked. To change
  the defaults, edit `DEFAULT_NAMES` in `src/storage.js`.
- Tick who is in the call. **Select all / Clear all** flips everyone.
- Add a name (it arrives ticked), click a name to rename it (Enter saves,
  Escape cancels), or **remove** it.
- **Remove** and **Reset to default list** can be undone from the notice that
  appears, until you make another change.
- Choose 2–8 teams. The line under the options previews the split, e.g.
  "2 teams of 7" or "2 teams: 6, 7".

Roster changes last until you refresh. Only the team count and the draft pick
order are remembered between visits.

### Spinning

- **Space** or the Spin button spins. Clicking the wheel skips to the end of
  the spin.
- A card announces the winner. It closes by itself after a couple of seconds,
  or on Space, Escape, its X or a click outside it.
- With one person left, the button reveals them without spinning.
- **Undo last pick** puts the last person back in their slice. In a draft it
  keeps going past the first pick, back into the captain spins.

### Results

- **Copy for Discord** copies bold team names with a bulleted list of players.
- **Back to setup** asks for a second click, since it throws the teams away.

## Fairness

Each winner is drawn with `Math.random()` before the wheel moves, and the wheel
is animated to land on that slice, away from the dividers. Skipping the
animation lands on the same slice, so nothing on screen can change the result.

## Project layout

`src/app.js` owns the state and chooses which screen is showing. Screens never
redraw themselves: every change calls `render()`, which redraws the app from
state.

| Files | Role |
|---|---|
| `setup-view`, `roster-panel`, `run-view`, `draft-view`, `results-view` | One screen or panel each |
| `wheel`, `reveal`, `captain-picker`, `team-board`, `team-view`, `run-controls`, `dom` | Shared UI pieces |
| `roster`, `teams`, `run`, `draft`, `rng`, `format`, `storage`, `confirm` | Pure logic, no DOM, unit tested |
| `scripts/serve.js`, `scripts/public-path.js` | Dev server and the list of files it may serve |

The dev server sends `Cache-Control: no-store` so CSS edits show up on reload,
listens only on this machine, and serves only `index.html`, `styles.css`,
`favicon.png` and `src/*.js`. New files in `src/` need lower-case,
hyphenated names (`run-view.js`), or the server won't serve them; a test
catches this.

## Tests

    npm test

Uses Node's built-in test runner. The pure logic and the dev server are
covered; the wheel and screens are checked by hand in a browser.
