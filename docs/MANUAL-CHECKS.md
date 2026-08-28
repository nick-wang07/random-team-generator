# Manual checks

## Setup view

- [x] Adding a name puts it in the list and clears the input.
- [x] Adding the same name in different case shows "already on the roster".
- [x] Adding only whitespace shows "Name cannot be empty".
- [x] Removing a checked person leaves no ghost check-off behind.
- [x] Two people checked with Teams at 2 enables both start buttons.
- [x] Teams at 3 with two people checked disables them and reads
      "Need at least 3 people for 3 teams".
- [x] Refreshing restores the roster, the check-offs, and the team count.

## Inline rename

- [x] No rename button appears on any row.
- [x] Clicking a name turns it into a text input with the current name selected.
- [x] Typing a new name and pressing Enter renames the person, and it survives a refresh.
- [x] Escape leaves the original name untouched.
- [x] Clicking away from an open editor commits the change.
- [x] Renaming someone to their own name in different case (e.g. Nick -> NICK) is accepted.
- [x] Renaming someone to a name another person already has shows "is already on the roster"
      AND leaves the editor open with the typed text intact.
- [x] Renaming to blank shows "Name cannot be empty" and leaves the editor open.
- [x] Clicking the name does not toggle that row's checkbox.
- [x] Tabbing to a name and pressing Enter opens the editor.
- [x] Typing in an open editor, then toggling a different row's checkbox, leaves
      the editor open with the typed text intact (not reset to the saved name).
- [x] Typing a duplicate name, pressing Enter to get the "already on the roster"
      error, then toggling a checkbox keeps the error and the typed text intact.
- [x] Typing in an open editor, then changing the team count, leaves the typed
      text intact.
- [x] With row A's editor open and erroring on a duplicate name, clicking row
      B's name directly (no Escape first) opens B's editor with B's own
      persisted name selected — never A's abandoned text — and A reverts to
      its own persisted name.
- [x] A failed "add a name" submission while a row's editor is showing a
      rejected-name error displays the add error, not the stale editor error,
      and that stale error does not resurface on the next unrelated render.

## Wheel run and results

With six people checked and Teams at 2:

- [x] "Spin the wheel" hides setup and shows the run view.
- [x] The heading reads "Spinning for Team A" before the first pick.
- [x] Each "Pick next" click moves one name into a team and flips the heading
      to the other team.
- [x] The count in the button ticks down to zero.
- [x] Nobody is assigned twice and nobody is left out.
- [x] The results view appears after the last pick, with teams of 3 and 3.
- [x] With five people the split is 3 and 2, and Team A gets the extra
      person.
- [x] "Copy for Discord" puts readable text on the clipboard.
- [x] "Back to setup" returns to the roster with the check-offs intact.

## Wheel drawing

- [x] Starting a run shows a full wheel with one slice per person in the pool.
- [x] Every name is readable and no two neighbouring slices share a colour.
- [x] The pointer is clearly at the top.
- [x] Clicking "Pick next" removes that person's slice and the wheel redraws evenly.
- [x] With twelve names the text still fits inside the slices.
- [x] Resizing the window keeps the wheel crisp, not blurry or stretched.

## Wheel spinning

With six people checked and Teams at 2:

- [x] Clicking Spin turns the wheel for about four seconds and decelerates smoothly.
- [x] The pointer stops inside a slice, not on a divider line.
- [x] The name under the pointer is exactly the name announced and the one added to
      the team. Verified across two complete six-person runs (12 picks total) plus
      individual spins watched mid-flight — every announced winner matched the
      slice sitting under the pointer when the wheel stopped.
- [x] Spinning is not clickable again while the wheel is turning (a rapid
      triple-click on Spin advanced only one pick).
- [x] Spinning for the same-sized pool twice stops at visibly different offsets.
- [x] The heading names the correct team before each spin, alternating A, B, A, B.
- [x] A full six-person run ends on the results view with 3 and 3.

## Draft setup

With six people (Alice, Bob, Carol, Dave, Eve, Frank) checked and Teams at 2:

- [x] Choosing "Choose captains" reveals a checkbox list of the present
      people only.
- [x] With 2 teams, selecting 1 captain disables the draft button and says
      "Pick exactly 2 captains (1 selected)".
- [x] Selecting 2 captains enables it and starts the draft with each captain
      already on a team (Bob seeded on Team A, Alice on Team B; the wheel
      showed only the remaining four names, with "Spin (4 left)").
- [x] With "Spin for captains", the wheel spins twice, headings read
      "Spinning for Team A's captain" then "Spinning for Team B's captain".
- [x] **Verified in Task 12** (was unverifiable in Task 11 — see note below).
      After the second captain spin, the draft board appears with both
      captains seeded and neither still in the pool.
- [x] Unchecking a present person also drops them as a captain (unchecking
      Alice while she was a selected captain removed her from the captain
      list entirely and dropped the selected count back to 1).
- [x] The snake and alternating choice survives a refresh (set to
      "Alternating", refreshed, still "Alternating"); the captain mode
      resets to "Spin for captains" even though "Choose captains" was
      selected before the refresh.

**Note on the now-verified check:** Task 11 could not verify this because
its `render()` deliberately omitted the routing block that turns a finished
`mode: 'captains'` run into a `beginDraftFromCaptains` call — Task 12 owns
that block (see the Draft board section below). With Task 12's `render()`
in place, completing the second captain spin now correctly transitions
straight to the draft board instead of falling through to the results view.
Confirmed in the browser: after two spins each seed the winning captain
onto their team and leave the pool, `render()` detects the completed
`captains` run, calls `beginDraftFromCaptains`, and the draft board appears
with the two captains already seeded and the remaining four names as pool
buttons.

## Draft board

With six people (Alice, Bob, Carol, Dave, Eve, Frank) checked and Teams at 2,
hand-picked captains (Alice for Team A, Bob for Team B):

- [x] The board shows the four non-captains (Carol, Dave, Eve, Frank) as
      large buttons.
- [x] The heading reads "Team A picks — pick 1 of 4".
- [x] Clicking a name (Carol) moves it into Team A and the heading advances
      to "Team B picks — pick 2 of 4".
- [x] In **snake** order the sequence of picking teams is A, B, B, A.
- [x] In **alternating** order (same roster, re-drafted) it is A, B, A, B.
- [x] A clicked name disappears from the pool immediately and cannot be
      picked twice (the pool button is removed from the DOM on each pick).
- [x] After the last pick the results view appears with all six people
      placed (Team A: Alice, Carol, Frank; Team B: Bob, Dave, Eve).
- [x] With 3 teams and 9 people (P1-P9, captains P1/P2/P3), snake picks run
      A, B, C, C, B, A, ending with 3 people on each team.

With "Spin for captains" (six people, Teams at 2) — this is the check Task
11 could not verify:

- [x] After the second captain spin completes, `render()` routes the
      finished `mode: 'captains'` run into `beginDraftFromCaptains` and the
      draft board appears: both captains already seeded onto their teams,
      neither in the pool, heading reads "Team A picks — pick 1 of 4", and
      the remaining four names show as pool buttons. Completing the draft
      from there ends on the results view with all six people placed.
      (The wheel's spin animation itself does not run in this sandbox — its
      `requestAnimationFrame` loop is suspended because the automation tab
      reports `visibilityState: 'hidden'`, a pre-existing environmental
      limitation, not specific to this check. The pick was applied through
      the app's real, running `render()` and the real `applyPick` from
      `src/run.js` — the exact functions `spinOnce()` calls — so the
      routing logic under test ran unmodified in the live page.)

## Undo, keyboard, and the final pass

- [x] Undo during a wheel run puts the person back on the wheel in their old
      slice position. Spun an 8-person, 3-team wheel run; the winner's slice
      (colour, name, and angular position) reappeared exactly where it had
      been before the spin, and the team's member count dropped back by one.
- [x] Undo is disabled before the first pick of a run. Confirmed for a fresh
      wheel run and for a fresh captain draft (captains are seeded directly,
      not via a pick, so `history` starts empty and "Undo last pick" renders
      disabled in both).
- [x] Undo from the results view reopens the run with the last pick
      reversed. On a completed 8-person, 3-team wheel run, clicking undo
      from the results view dropped straight back into the run view with
      the last winner back on the wheel and that team's count reduced by
      one — `isComplete` turning false again is what routes `render()` back
      out of the results view.
- [x] Space bar spins the wheel, and typing a name into the roster input
      never triggers a spin. Verified space spins when focus is on a
      non-input, non-button element (e.g. the heading) and when focus is on
      the Spin button itself (native button activation), in both cases
      advancing by exactly one pick, never two. The roster input can only be
      focused during setup, where `state.run` is null and the handler no-ops
      before it ever checks the key.
- [x] Space bar does nothing on the draft board. Pressed space with the
      draft board showing; no pick was made, no error.
- [x] "Back to setup" mid-run returns to the roster with check-offs intact.
      Verified for the wheel view — all 8 checked people and the team count
      were still set after returning.
- [x] A full 8-person, 3-team wheel run and a full 8-person, 3-team snake
      draft both complete correctly. Wheel: Team A (Eve, Grace, Carol),
      Team B (Heidi, Alice, Frank), Team C (Dave, Bob) — 3/3/2, all eight
      placed once each. Snake draft (captains Alice/Bob/Carol): Team A
      (Alice, Dave), Team B (Bob, Eve, Heidi), Team C (Carol, Frank, Grace)
      — pick order followed A, B, C, C, B, A as expected.

### Deferred fixes (also verified)

- [x] **Wheel labels flip on the left half.** Across many spins at
      different rotations (8-, 5-, 3-, 2-slice wheels), every name read
      left-to-right and upright regardless of which side of the wheel its
      slice landed on — nothing appeared mirrored or upside down.
- [x] **Wheel font size responds to canvas radius, not just label count.**
      At a canvas resized to 320px wide (radius ~130px), realistic long
      names ("Christopher", "Alexander", "Elizabeth", "Nathaniel") rendered
      fully inside their slices without touching the hub. Measured via
      `canvas.measureText`: at the narrow width the font floors at 14px and
      the radial budget before the hub is ~86px; those names measure
      57–74px wide, comfortably inside. Two deliberately extreme synthetic
      names (14 and 16 characters, "Christopherson" and
      "Alexanderopoulos") still slightly overrun the hub even at the 14px
      floor (97px and 115px against the same ~86px budget) — the fix is a
      global font-size formula, not per-label text measurement, so a
      readability floor and a genuinely very long single word can still
      exceed the available radial space. This is a large improvement over
      the pre-fix behavior (which held the font at a fixed 28px regardless
      of canvas size) but not a hard guarantee for arbitrary name length.
- [x] **Clipboard copy failure is handled.** Patched
      `navigator.clipboard.writeText` to reject and clicked "Copy for
      Discord": the button showed "Copy failed" instead of throwing an
      unhandled rejection, then reverted to its normal label after the
      timeout, same as the success path.
