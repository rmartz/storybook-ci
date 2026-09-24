/** The message of a thrown value, whatever it turned out to be. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * What a failed child process (e.g. `gh`) said on stderr, falling back to the
 * error's message. `execFileSync` attaches captured stderr as a string or Buffer;
 * quoting it alone keeps the full command line (and its arguments) out of PR
 * comments.
 */
export function stderrOf(error: unknown): string {
  const stderr = (error as { stderr?: unknown } | null)?.stderr;
  const text = stderr === undefined || stderr === null ? '' : String(stderr).trim();
  return text || errorMessage(error);
}
