// Which request URLs the dev server may answer, and with which file. Only the
// app's own files are public, so .git and the rest of the repo stay private.
export const PUBLIC = /^(index\.html|styles\.css|favicon\.png|src\/[a-z-]+\.js)$/;

// { status: 200, rel } for a public file, 404 for anything else, and 400 for a
// URL that can't be decoded (e.g. "/%E0%A4%A").
export function publicPath(url) {
  let path;
  try {
    path = decodeURIComponent(new URL(url, 'http://x').pathname);
  } catch {
    return { status: 400 };
  }
  const rel = path === '/' ? 'index.html' : path.slice(1);
  return PUBLIC.test(rel) ? { status: 200, rel } : { status: 404 };
}
