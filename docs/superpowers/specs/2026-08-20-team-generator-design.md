# Random Team Generator — Design

**Date:** 2026-08-20
**Status:** Approved, ready for implementation planning

## Purpose

A wheel spinner and team generator for a Discord friend group. Before a game,
whoever is hosting checks off who is in the voice call, picks how many teams,
and either spins a wheel to assign people one at a time or runs a captain
draft. The host screen-shares the result.

Two modes:

- **Wheel mode** — the wheel picks a random person from the remaining pool and
  assigns them to the next team in rotation.
- **Draft mode** — captains take turns choosing their own teammates, in either
  snake or alternating order. The app tracks the draft; the humans decide.

## Constraints

- Static site on GitHub Pages. No backend, no build step, no dependencies.
- Plain ES modules served directly from the repository root on `main`.
- Primary viewing context is a screen share in Discord: dark theme, large
  type, high contrast. Mobile layout is not a requirement.

## Architecture

```
index.html      one page, three views (setup / wheel / draft) toggled by state
styles.css      dark, high-contrast, sized for a screen-shared window
src/
  storage.js    localStorage read/write, versioned key, degrades to in-memory
  roster.js     pure: add/remove/rename, trim + dedupe, validation
  teams.js      pure: headcount + team count -> team sizes and pick rotation
  draft.js      pure: captains + team count + order mode -> pick sequence
  rng.js        random selection, injectable so tests are deterministic
  wheel.js      canvas: draw slices, spin, decelerate onto a given index
  app.js        controller — the only file that touches both DOM and logic
```

### Key decision: the RNG picks the winner, the wheel only animates

The winner of a spin is selected by `rng.js` *before* the animation starts.
`wheel.js` is then told which slice to stop on and computes the rotation to get
there. The wheel is presentation only.

Consequences:

- Fairness lives in `rng.js` and `teams.js`, where tests can reach it.
- The animation can never bias or contradict the result.
- `wheel.js` knows nothing about teams, people, or drafts — only slices.

`teams.js`, `draft.js`, `roster.js`, and `rng.js` never import DOM APIs, so
`node --test` imports them straight from disk with no bundler and no jsdom.

## Data model

One state object. Marked fields persist to localStorage under a versioned key.

```js
roster:  [{ id, name }]                          // persisted
present: [id]                                    // persisted
config:  { teamCount: 2, draftOrder: 'snake' }   // persisted
run:     { mode, teams: [{ name, members: [id] }], pool: [id], turnIndex, history: [] }
```

`present` persists so last session's check-offs come back pre-ticked — the same
people are usually in the call. When someone is removed from the roster, their
id is dropped from `present` at load time so stale ids cannot leak into a run.

`run` is transient. `run.history` is a stack of applied picks, which is what
makes **undo** possible in both modes; one misclick should not restart the
night.

## Team sizing

Given `n` present people and `k` teams: every team gets `floor(n / k)` members,
and the first `n mod k` teams get one extra.

A plain rotation (A, B, A, B, ...) then fills exactly those sizes with no
special-casing, because the remainder is front-loaded onto the same teams the
rotation reaches first.

- 5 people, 2 teams -> 3 / 2
- 7 people, 3 teams -> 3 / 2 / 2
- 8 people, 2 teams -> 4 / 4

Uneven splits are displayed, not hidden.

Team count defaults to 2. Values of 3, 4, or a custom number are available but
rarely used. The allowed range is 2 to 8; anything outside it is rejected at
setup.

Teams are labelled Team A, Team B, and so on. Renaming teams is out of scope.

## Wheel mode

1. **Setup** — checkbox list of the roster, team count (default 2), Start.
2. **Spin** — one wheel with every present name as a slice. The header reads
   "Spinning for Team A" *before* the spin, so the stakes are visible while it
   turns.
3. **Land** — the winner's name moves to the Team A column, their slice is
   removed, and the wheel redraws with the remaining names.
4. **Rotate** — the next spin is for Team B, then A, and so on until the pool
   is empty.
5. **Results** — teams side by side, large enough to read on a stream, with a
   Copy button that produces a plain-text version to paste into Discord chat.

Undo pops the last pick back onto the wheel and rewinds the turn.

### Landing position

The pointer must not stop dead center of a slice every time; that reads as
fake. Two random draws happen per spin, both from `rng.js`:

1. **Which slice wins** — uniform over the remaining pool.
2. **Where inside that slice the pointer stops** — uniform over the middle 80%
   of the slice, leaving a 10% pad on each edge so the pointer never straddles
   a divider line.

With 12 names a slice is 30 degrees, so the pad is 3 degrees and roughly 24
degrees of visible variance remain. The same person winning twice looks
different each time.

Final rotation is `(4 to 6 random full spins) + (angle bringing that point
under the pointer)`, eased out cubically over about 4 seconds.

Because both draws come from `rng.js`, a test with an injected source can pin
the winner *and* assert the exact angle the wheel was asked to stop at.

## Draft mode

Setup adds two things to the wheel-mode setup:

- **Captains** — either spun for (the wheel runs `k` times, once per team) or
  hand-picked from a second set of checkboxes. The host chooses which at setup.
  Captains are seeded into their teams and leave the pool.
- **Order** — snake (A, B, B, A, A, B) or alternating (A, B, A, B). This
  changes only the generated pick sequence; the board is identical either way.

The draft board is a tracker, not a decider:

- Remaining names as large clickable buttons.
- Team columns along the side.
- A header reading "Team B picks — pick 4 of 8".

Whoever is driving clicks the name the captain called out. Same undo, same
results screen.

The number of picks is `present.length - k`, since captains already occupy one
slot each.

## Shared behavior

The only real difference between the modes is who chooses. Both funnel into the
same team state and the same results view, and `app.js` handles "a pick
happened" identically regardless of source.

## Failure modes

| Situation | Behavior |
|---|---|
| Fewer present than teams (2 people, 3 teams) | Start disabled, inline reason: "Need at least 3 people for 3 teams" |
| Fewer than 2 people present | Start disabled — nothing to generate |
| Duplicate name added | Rejected with a message; names trimmed, compared case-insensitively |
| Empty or whitespace-only name | Rejected |
| More or fewer captains ticked than teams | Start blocked until the count matches `k` exactly |
| localStorage blocked (private window) | App runs; roster does not survive refresh; one quiet notice, no crash |
| Corrupt or old saved data | Versioned key; unreadable data is discarded, starting from an empty roster rather than a broken app |
| Tab resized mid-spin | Canvas re-renders at the new size; the running animation is not interrupted |

## Testing

`node --test`, no dependencies.

Automated:

- `teams.js` — every split from 2 to 16 people across 2 to 5 teams sums to the
  headcount and stays within one of even.
- `draft.js` — snake and alternating sequences for 2, 3, and 4 teams: correct
  length, each team receives its due number of picks.
- `roster.js` — dedupe, trim, rejection of empty and duplicate names.
- `rng.js` — an injected source produces a deterministic winner and a
  deterministic landing offset.

Manual, via a written checklist:

- `wheel.js` and `app.js` — canvas rendering and DOM wiring. Testing canvas
  pixels is not worth the machinery for this app.

## Out of scope

- **Sound effects.** A page that makes noise on someone's stream is usually a
  regret. Easy to add later.
- Shareable URLs encoding the roster or result.
- Any Discord API integration.
- Mobile-first layout.

## Phases

Each phase ends at a point where work could stop.

1. **Roster + shell.** Setup screen fully working: add, remove, rename, check
   off, team count, persistence. Push and enable GitHub Pages so the URL is
   live from day one. *Ends with: a working roster page on the internet.*
2. **Assignment logic, headless.** `teams.js`, `rng.js`, the pick rotation, and
   the results view, driven by a plain "Pick next" button with no wheel. Fully
   tested. *Ends with: correct teams, ugly presentation.*
3. **The wheel.** Canvas rendering, spin animation, landing-offset math, slice
   removal, winner reveal. Replaces the plain button. *Ends with: the thing the
   app is for.*
4. **Draft mode.** Captains (spun or picked), snake and alternating sequences,
   the draft board, reusing the results view. *Ends with: both modes done.*
5. **Polish.** Dark theme tuned for screen share, undo in both modes,
   copy-to-Discord, empty states, space bar to spin, and a final pass on the
   live site.
