import { resolve, sep } from 'node:path';

/**
 * Resolve a request URL path to a file inside `staticRoot`, or `null` when it
 * would escape the directory. This guards the capture-time static server against
 * path traversal (CWE-22): the URL comes from an HTTP request, so a path like
 * `/../../etc/passwd` (or a percent-encoded variant) must never read a file
 * outside the served Storybook build. The server binds localhost for the few
 * seconds of a capture and only our own Playwright connects, but the containment
 * check is cheap and keeps this shared code correct regardless of the caller.
 *
 * `staticRoot` must already be absolute (the caller resolves it once).
 */
export function resolveStaticPath(staticRoot: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null; // malformed percent-encoding
  }
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const resolved = resolve(staticRoot, rel);
  // Containment: the resolved path must be the root itself or sit strictly inside
  // it. Appending the separator prevents a sibling like `<root>-evil` from passing.
  if (resolved !== staticRoot && !resolved.startsWith(staticRoot + sep)) {
    return null;
  }
  return resolved;
}
