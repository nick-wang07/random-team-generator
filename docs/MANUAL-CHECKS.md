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
