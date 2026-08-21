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
