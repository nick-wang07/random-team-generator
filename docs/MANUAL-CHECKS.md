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
- [ ] **Unverifiable as specified — see note below.** After the second
      captain spin, the draft board appears with both captains seeded and
      neither still in the pool.
- [x] Unchecking a present person also drops them as a captain (unchecking
      Alice while she was a selected captain removed her from the captain
      list entirely and dropped the selected count back to 1).
- [x] The snake and alternating choice survives a refresh (set to
      "Alternating", refreshed, still "Alternating"); the captain mode
      resets to "Spin for captains" even though "Choose captains" was
      selected before the refresh.

**Note on the unverifiable check:** Per the task-11 pre-flight ruling, this
task deliberately does not insert the `render()` block that routes a
finished `mode: 'captains'` run into `beginDraftFromCaptains` — Task 12
restates the entire `render()` function including that routing, and adding
it here would cause a double-insertion. Without that routing, a completed
captain-spin run currently falls through to the ordinary "finished run"
branch and renders the results view (a "Teams" heading with a one-person
Team A/Team B and a Discord-copy button) instead of the draft board. What
*is* verified: the underlying run mechanics are correct — the second spin's
winner is a different person than the first, both are removed from the
pool immediately after their spin, and each is seeded onto the correct
team. The board itself is Task 12's deliverable.
