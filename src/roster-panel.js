import { el } from './dom.js';
import { addPerson, removePerson, renamePerson, prunePresent, displayName } from './roster.js';
import { defaultRosterState } from './storage.js';

// The setup screen's roster panel: who is in the call, adding, renaming and
// removing. It owns the inline rename editor's state.
export function createRosterPanel({ state, persist, render, showError }) {
  // Id of the row being renamed, or null.
  let editingId = null;
  // The open editor's text and caret, saved before each render so unrelated
  // renders (a checkbox, the team count) don't reset what's being typed.
  let editingDraft = null; // { id, value, selectionStart, selectionEnd } | null
  // A rejected rename's error, kept while its editor stays open.
  let editingError = null;
  // Select the whole name only on the render that opens the editor.
  let editingJustOpened = false;
  // Snapshot for the undo notice: { message, roster, present } | null
  let lastUndo = null;

  // Call before the change. Updates always replace the arrays, so keeping the
  // references is safe.
  function rememberUndo(message) {
    lastUndo = { message, roster: state.roster, present: state.present };
  }

  // Any other roster change drops the undo: restoring the snapshot now would
  // also silently throw that change away.
  function forgetUndo() {
    lastUndo = null;
  }

  function forgetEditor() {
    editingId = null;
    editingDraft = null;
    editingError = null;
  }

  // The open editor's error, or null.
  function openEditorError() {
    return editingId && editingError ? editingError : null;
  }

  function togglePresent(id, isPresent) {
    state.present = isPresent
      ? [...new Set([...state.present, id])]
      : state.present.filter((x) => x !== id);
    forgetUndo();
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
    // Marks whose editor this is, so a stale input from another row is never
    // mistaken for the open one.
    input.dataset.personId = person.id;
    input.value = editingDraft && editingDraft.id === person.id ? editingDraft.value : person.name;

    // Removing the input fires blur, which would commit a second time.
    let settled = false;

    function commit() {
      if (settled) return;
      settled = true;
      try {
        state.roster = renamePerson(state.roster, person.id, input.value);
        forgetEditor();
        // Clicking away from an unchanged name is not a change.
        if (displayName(state.roster, person.id) !== person.name) forgetUndo();
        persist();
        render();
      } catch (err) {
        // Keep the editor open with the typed text so it can be fixed.
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
    // Save the open editor's text and caret before rebuilding the list.
    if (editingId) {
      const liveInput = list.querySelector('.name-edit');
      // Only if it belongs to the row still being edited: a failed commit can
      // leave another row's input behind.
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

    // One button: select everyone, or clear everyone if all are ticked.
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
    forgetUndo();
    persist();
    render();
  });

  // Undoable, like remove.
  el('reset-roster-btn').addEventListener('click', () => {
    forgetEditor();
    rememberUndo('Default list restored.');
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
      // Someone being added is almost always in the call, so tick them.
      state.present = [...state.present, state.roster[state.roster.length - 1].id];
      input.value = '';
      showError('');
      forgetUndo();
      persist();
      render();
    } catch (err) {
      // Drop any stale rename error so it can't resurface over this one.
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
    // Called when a run starts, so returning to setup doesn't reopen a rename.
    forgetEditor,
  };
}
