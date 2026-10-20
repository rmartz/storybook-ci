import { execFileSync } from 'node:child_process';

import { stderrOf } from './lib/error-message.js';

/** The fields of a PR comment that decide whether it is a superseded gallery. */
export interface PrComment {
  /** GraphQL node id, which `minimizeComment` takes. */
  id: string;
  body: string;
  /** Posted by the token's own account — never hide someone else's comment. */
  viewerDidAuthor: boolean;
  isMinimized: boolean;
}

/**
 * The galleries a newly posted one supersedes: every comment the token's account
 * posted that leads with the gallery marker, except the newest, and not already
 * hidden. `comments` is in the PR's chronological order, so the newest gallery is
 * the one just posted. Leading with the marker (not merely containing it) keeps a
 * human comment that quotes it from being hidden. Pure, so it is unit-tested.
 */
export function selectStaleGalleries(comments: PrComment[], marker: string): string[] {
  const galleries = comments.filter(
    (comment) => comment.viewerDidAuthor && comment.body.startsWith(marker),
  );
  return galleries
    .slice(0, -1)
    .filter((comment) => !comment.isMinimized)
    .map((comment) => comment.id);
}

const COMMENTS_QUERY = `query($owner: String!, $name: String!, $number: Int!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      comments(first: 100, after: $endCursor) {
        nodes { id body viewerDidAuthor isMinimized }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const MINIMIZE_MUTATION = `mutation($id: ID!) {
  minimizeComment(input: { subjectId: $id, classifier: OUTDATED }) { clientMutationId }
}`;

interface CommentsPage {
  data: { repository: { pullRequest: { comments: { nodes: PrComment[] } } } };
}

/**
 * Hide every earlier gallery as outdated, so a PR shows one expanded gallery and
 * the history stays a click away. Best-effort: the new gallery is already posted,
 * so a failure here is logged and never fails the job. `gh` authenticates with
 * the same PAT that posted the gallery (via `GH_TOKEN`), which is what makes
 * `viewerDidAuthor` pick out the bot's own comments.
 */
export function hideStaleGalleries(repo: string, prNumber: string, marker: string): void {
  const [owner = '', name = ''] = repo.split('/');
  try {
    const raw = execFileSync(
      'gh',
      [
        'api',
        'graphql',
        '--paginate',
        '--slurp',
        '-f',
        `query=${COMMENTS_QUERY}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '-F',
        `number=${prNumber}`,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const pages = JSON.parse(raw) as CommentsPage[];
    const comments = pages.flatMap((page) => page.data.repository.pullRequest.comments.nodes);
    const stale = selectStaleGalleries(comments, marker);
    for (const id of stale) {
      execFileSync('gh', ['api', 'graphql', '-f', `query=${MINIMIZE_MUTATION}`, '-F', `id=${id}`], {
        stdio: ['ignore', 'ignore', 'pipe'],
      });
    }
    if (stale.length > 0)
      console.log(`Hid ${stale.length} earlier gallery comment(s) as outdated.`);
  } catch (error) {
    console.error(`::warning::Could not hide earlier gallery comments: ${stderrOf(error)}`);
  }
}
