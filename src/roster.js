function defaultMakeId() {
  return crypto.randomUUID();
}

export function normalizeName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function matchKey(name) {
  return normalizeName(name).toLowerCase();
}

function assertUsable(roster, name, exceptId = null) {
  const clean = normalizeName(name);
  if (clean === '') throw new Error('Name cannot be empty');
  const key = matchKey(clean);
  const clash = roster.some((p) => p.id !== exceptId && matchKey(p.name) === key);
  if (clash) throw new Error(`"${clean}" is already on the roster`);
  return clean;
}

export function addPerson(roster, name, makeId = defaultMakeId) {
  const clean = assertUsable(roster, name);
  return [...roster, { id: makeId(), name: clean }];
}

export function removePerson(roster, id) {
  return roster.filter((p) => p.id !== id);
}

export function renamePerson(roster, id, name) {
  const clean = assertUsable(roster, name, id);
  return roster.map((p) => (p.id === id ? { ...p, name: clean } : p));
}

export function prunePresent(roster, present) {
  const ids = new Set(roster.map((p) => p.id));
  return present.filter((id) => ids.has(id));
}

export function findPerson(roster, id) {
  return roster.find((p) => p.id === id);
}
