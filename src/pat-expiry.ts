/**
 * Expiry warning for `STORYBOOK_SCREENSHOT_PAT`.
 *
 * An expired PAT is indistinguishable from an invalid one by the time it fails:
 * the preflight can only report that the gallery stopped working. GitHub returns
 * the expiration date on every authenticated REST response, so the warning can
 * arrive weeks earlier for the cost of reading a header the preflight already
 * fetches.
 *
 * Everything here is pure so it is unit-tested; the `gh` call lives in bin/.
 */

/**
 * Returned on any REST response authenticated with a PAT that carries an
 * expiration date — both fine-grained and classic-with-expiry. A token created
 * with no expiration emits nothing, which is why this degrades to silence rather
 * than treating absence as a problem.
 */
const EXPIRATION_HEADER = 'github-authentication-token-expiration';

const MS_PER_DAY = 86_400_000;

/**
 * Pull the expiration out of a raw `gh api -i` response. Returns null whenever
 * the answer is not a usable date — header absent (no-expiry token), value
 * unparseable, or the format changed — so every failure path lands on today's
 * behavior instead of breaking the preflight.
 *
 * Only the header block is scanned. The response body is JSON that could itself
 * contain a header-shaped line, and a field of the authenticated user's profile
 * is attacker-influencable in a way a real header is not.
 */
export function parseTokenExpiration(rawResponse: string): Date | null {
  for (const line of rawResponse.split(/\r?\n/)) {
    // A blank line terminates the header block; anything after it is the body.
    if (line.trim() === '') return null;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    if (line.slice(0, separator).trim().toLowerCase() !== EXPIRATION_HEADER) continue;

    // Permissive on format deliberately: GitHub documents this as a date-time
    // string but not an exact shape, and Date handles every variant observed
    // ('… -0800', '… UTC', ISO 8601). An unparseable value falls through to null.
    const parsed = new Date(line.slice(separator + 1).trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Whole days until `expiresAt`, rounded up so a token expiring in 25 hours reads
 * as 2 days rather than 1. Negative when already past.
 */
export function daysUntil(expiresAt: Date, now: Date): number {
  return Math.ceil((expiresAt.getTime() - now.getTime()) / MS_PER_DAY);
}

/**
 * The one-line footer appended to the gallery comment, or null when there is
 * nothing worth saying — no expiration date, or expiry further out than
 * `warningDays`.
 *
 * The date is re-rendered from the parsed value rather than echoed from the
 * header, so nothing from the response reaches the comment body or
 * `$GITHUB_OUTPUT` verbatim.
 */
export function buildExpiryNotice(
  expiresAt: Date | null,
  now: Date,
  warningDays: number,
  docsUrl: string,
): string | null {
  if (!expiresAt) return null;
  const days = daysUntil(expiresAt, now);
  if (days > warningDays) return null;

  const date = expiresAt.toISOString().slice(0, 10);
  const when =
    days <= 0
      ? `has **expired** (${date})`
      : days === 1
        ? `expires **tomorrow** (${date})`
        : `expires in **${days} days** (${date})`;
  return `> ⚠️ The \`STORYBOOK_SCREENSHOT_PAT\` secret ${when}. Rotate it to keep this gallery posting — see ${docsUrl}.`;
}
