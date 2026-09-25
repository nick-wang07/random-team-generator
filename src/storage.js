export const STORAGE_KEY = 'rtg.v1';

// The regulars. The roster is not saved: every page load starts from this
// list with everyone ticked. Only the team count and draft order persist.
const DEFAULT_NAMES = [
  'Andrew', 'Brandon', 'Brennan', 'Chase', 'Chin', 'Colten', 'Craig',
  'Isaiah', 'Jordan', 'Major', 'Nick', 'Nikhil', 'Walter', 'Wyatt',
];

function defaultRoster() {
  return DEFAULT_NAMES.map((name) => ({ id: name.toLowerCase(), name }));
}

function defaults() {
  const roster = defaultRoster();
  return {
    roster,
    present: roster.map((person) => person.id),
    config: { teamCount: 2, draftOrder: 'snake' },
  };
}

export const DEFAULT_STATE = Object.freeze(defaults());

// A fresh copy of the default roster, for "Reset to default list".
export function defaultRosterState() {
  const { roster, present } = defaults();
  return { roster, present };
}

// localStorage, or null where using it throws (e.g. some private windows).
export function browserBackend() {
  try {
    const probe = '__rtg_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export function createStorage(backend) {
  return {
    available: Boolean(backend),

    load() {
      if (!backend) return defaults();
      let raw;
      try {
        raw = backend.getItem(STORAGE_KEY);
      } catch {
        return defaults();
      }
      if (!raw) return defaults();
      try {
        const parsed = JSON.parse(raw);
        const config = parsed && parsed.config ? parsed.config : {};
        const { roster, present } = defaults();
        return {
          roster,
          present,
          config: {
            teamCount: Number.isInteger(config.teamCount) ? config.teamCount : 2,
            draftOrder: config.draftOrder === 'alternating' ? 'alternating' : 'snake',
          },
        };
      } catch {
        return defaults();
      }
    },

    save(state) {
      if (!backend) return false;
      try {
        backend.setItem(STORAGE_KEY, JSON.stringify({
          config: state.config,
        }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
