// index.html is the source of truth for element ids; this is the only way the
// view modules reach them.
export const el = (id) => document.getElementById(id);
