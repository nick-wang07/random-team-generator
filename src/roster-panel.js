import { el } from './dom.js';
import { addPerson, removePerson, renamePerson, prunePresent } from './roster.js';
import { defaultRosterState } from './storage.js';

// The left-hand panel on the setup screen: who is on the roster, who is in the
// call, renaming, removing, adding. It owns the whole inline name editor —
// four pieces of transient state that only make sense together — so nothing
// outside this file can get half of that dance wrong.
//
// `showError` writes to the shared error line over in the config panel, which
// is why it is passed in rather than looked up here: this panel does not own
// that node, it only has things to say through it.
export function createRosterPanel({ state, persist, render, showError }) {
  // id of the roster row currently in edit mode, or null. Not part of `state` —
  // it's transient UI state, not something that gets persisted.
  let editingId = null;
  // Live snapshot of the open editor's <input>, captured just before any
  // render() rebuilds the roster list out from under it. render() gets called
  // for lots of reasons unrelated to the edit in progress (a different row's
  // checkbox, adding a person, changing the team count) — without this, each
  // of those would silently reset the editor back to the persisted name.
  let editingDraft = null; // { id, value, selectionStart, selectionEnd } | null
  // Error message tied to the still-open editor (e.g. a rejected duplicate or
  // empty name). The setup screen prefers this over its own validation message
  // so an incidental re-render doesn't clobber an error the host hasn't
  // resolved yet.
  let editingError = null;
  // True only for the render() that first opens an editor, so the initial open
  // selects the whole name (for fast overtyping) without re-selecting-all — and
  // eating the next keystroke — on every incidental re-render while mid-typing.
  let editingJustOpened = false;
  // The last destructive act, kept only so it can be undone: the message to
  // show, and the roster and presence it replaced. A snapshot rather than a
  // description of the change, so taking one person off the list and
  // replacing the whole list both undo through the same path.
  // { message, roster, present } | null
  let lastUndo = null;

  // Call BEFORE the change, while state still holds what is about to be lost.
  // Safe to keep the references: every roster and presence update replaces the
  // array rather than editing it, so the snapshot cannot be written through.
  function rememberUndo(message) {
    lastUndo = { message, roster: state.roster, present: state.present };
  }

  function forgetEditor() {
    editingId = null;
    editingDraft = null;
    editingError = null;
  }

  // The one way anything outside asks "is there an unresolved rename on
  // screen?". Returns the message to show, or null. Callers must not
  // reconstruct this from parts — the two-condition check is the whole point,
  // and splitting it is what once let a stale error outlive its editor.
  function openEditorError() {
    return editingId && editingError ? editingError : null;
  }

  function togglePresent(id, isPresent) {
    state.present = isPresent
      ? [...new Set([...state.present, id])]
      : state.present.filter((x) => x !== id);
    persist();
    render();
  }

  function nameButton(person) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'name name-btn';
    button.textContent = person.name;
    button.addEventListener('click', () => {
      editingId = person.id;
      editingDraft = null;
      editingError = null;
      editingJustOpened = true;
      render();
    });
    return button;
  }

  function nameEditor(person) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'name-edit';
    // Tags which person this live input belongs to, so renderRoster()'s
    // pre-rebuild snapshot never mistakes a different (possibly abandoned)
    // row's leftover editor for the one that's actually still open.
    input.dataset.personId = person.id;
    input.value = editingDraft && editingDraft.id === person.id ? editingDraft.value : person.name;

    // Guards against a commit firing twice: committing/cancelling detaches this
    // input via render(), and browsers fire a blur event on an element removed
    // from the document, which would otherwise re-trigger the blur handler below.
    let settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      try {
        state.roster = renamePerson(state.roster, person.id, input.value);
        forgetEditor();
        persist();
        render();
      } catch (err) {
        // Leave the editor open with the typed text so the host can fix it.
        settled = false;
        editingError = err.message;
        showError(err.message);
      }
    }

    function cancel() {
      if (settled) return;
      settled = true;
      forgetEditor();
      render();
    }

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        commit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', commit);

    return input;
  }

  function rosterRow(person) {
    const li = document.createElement('li');

    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.present.includes(person.id);
    box.addEventListener('change', () => togglePresent(person.id, box.checked));

    const name = editingId === person.id ? nameEditor(person) : nameButton(person);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'remove';
    remove.title = `Remove ${person.name} from the roster`;
    remove.addEventListener('click', () => {
      if (editingId === person.id) forgetEditor();
      // The roster is the one thing here that outlives the session, so taking
      // someone off it is a genuinely destructive act — hence the undo.
      rememberUndo(`Removed ${person.name}.`);
      state.roster = removePerson(state.roster, person.id);
      state.present = prunePresent(state.roster, state.present);
      persist();
      render();
    });

    li.append(box, name, remove);
    return li;
  }

  function renderRoster() {
    const list = el('roster-list');
    // Snapshot the live editor (value + caret) before it gets torn down, so an
    // unrelated render() can restore it below instead of resetting to the
    // persisted name.
    if (editingId) {
      const liveInput = list.querySelector('.name-edit');
      // Only trust this input if it actually belongs to the row we're still
      // editing. A row whose commit failed (and therefore skipped render())
      // can leave a stale, abandoned .name-edit for a DIFFERENT person in the
      // DOM — e.g. row A errors and is left open, then the host clicks
      // straight into row B's editor without resolving A first. Without this
      // check, A's leftover text would leak into B's freshly-opened editor.
      if (liveInput && liveInput.dataset.personId === editingId) {
        editingDraft = {
          id: editingId,
          value: liveInput.value,
          selectionStart: liveInput.selectionStart,
          selectionEnd: liveInput.selectionEnd,
        };
      }
    }
    list.replaceChildren();
    if (state.roster.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No one yet — add your friends below.';
      list.append(li);
      return;
    }
    list.append(...state.roster.map(rosterRow));
    if (editingId) {
      const input = list.querySelector('.name-edit');
      if (input) {
        input.focus();
        if (editingJustOpened) {
          input.select();
        } else if (editingDraft && editingDraft.selectionStart != null) {
          input.setSelectionRange(editingDraft.selectionStart, editingDraft.selectionEnd);
        }
      }
    }
    editingJustOpened = false;
  }

  function renderUndoNotice() {
    const box = el('removal-notice');
    if (!lastUndo) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const text = document.createElement('span');
    text.textContent = lastUndo.message;
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'link-btn';
    undo.textContent = 'Undo';
    undo.addEventListener('click', () => {
      state.roster = lastUndo.roster;
      state.present = lastUndo.present;
      lastUndo = null;
      persist();
      render();
    });
    box.replaceChildren(text, undo);
    box.hidden = false;
  }

  function renderPresence() {
    const present = state.present.length;
    const total = state.roster.length;
    el('present-count').textContent = total === 0
      ? ''
      : `${present} of ${total} in the call`;

    // One button that does whichever is useful: tick everyone, or clear them.
    const toggle = el('select-all-btn');
    const allPresent = total > 0 && present === total;
    toggle.hidden = total === 0;
    toggle.textContent = allPresent ? 'Clear all' : 'Select all';
    toggle.dataset.action = allPresent ? 'clear' : 'select';
  }

  el('select-all-btn').addEventListener('click', () => {
    state.present = el('select-all-btn').dataset.action === 'clear'
      ? []
      : state.roster.map((person) => person.id);
    persist();
    render();
  });

  // The roster outlives the session by design, so it can drift a long way from
  // the regulars. This puts it back without making anyone clear it by hand —
  // and it is itself undoable, since it throws away more than any other button
  // here.
  el('reset-roster-btn').addEventListener('click', () => {
    forgetEditor();
    rememberUndo('Reset to the default list.');
    const { roster, present } = defaultRosterState();
    state.roster = roster;
    state.present = present;
    persist();
    render();
  });

  el('add-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = el('name-input');
    try {
      state.roster = addPerson(state.roster, input.value);
      input.value = '';
      showError('');
      persist();
      render();
    } catch (err) {
      // A stale open-editor error (if any) shouldn't silently resurface over
      // this add-form error on the next incidental render — the host's
      // attention is on the add form right now, not the abandoned editor.
      editingError = null;
      showError(err.message);
    }
  });

  return {
    render() {
      renderRoster();
      renderPresence();
      renderUndoNotice();
    },
    openEditorError,
    // Starting a run abandons whatever row was mid-edit. Called from there so
    // "Back to setup" doesn't reopen that row with the rejected text and a
    // stale error sitting over the setup validation message.
    forgetEditor,
  };
}
