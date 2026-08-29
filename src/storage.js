export const STORAGE_KEY = 'rtg.v1';

// The regulars, so the app is usable the moment it opens instead of starting
// on an empty list. Ids are slugs rather than random, so they stay stable and
// readable in storage. This only seeds a browser that has never saved: once
// there is a saved roster it wins, including an empty one someone cleared on
// purpose.
const DEFAULT_NAMES = [
  'Andrew', 'Brandon', 'Brennan', 'Chase', 'Chin', 'Colton', 'Craig',
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

// Returns localStorage when it is usable, or null in a private window where
// touching it throws. Callers use the null to show a "nothing will be saved" notice.
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
        return {
          roster: Array.isArray(parsed.roster) ? parsed.roster : [],
          present: Array.isArray(parsed.present) ? parsed.present : [],
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
          roster: state.roster,
          present: state.present,
          config: state.config,
        }));
        return true;
      } catch {
        return false;
      }
    },
  };
}
