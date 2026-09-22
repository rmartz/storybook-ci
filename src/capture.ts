import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, resolve } from 'node:path';

import { chromium } from 'playwright';

import { resolveStaticPath } from './lib/static-path.js';
import type { StoryIndexEntry } from './types.js';

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// Per-story budgets. `domcontentloaded` (not `networkidle`) is the load signal —
// a story with ongoing network never reaches networkidle and would burn the full
// timeout, so a few such stories used to overrun the job into cancellation.
const NAV_TIMEOUT_MS = 15_000;
const RENDER_TIMEOUT_MS = 5_000;

export interface CaptureOptions {
  staticDir: string;
  port: number;
  viewport: { width: number; height: number };
  /** Whole-capture wall-clock budget, kept below the job's timeout-minutes. */
  deadlineMs: number;
}

export interface CapturedStory {
  story: StoryIndexEntry;
  buffer: Buffer;
}

export interface CaptureOutcome {
  captured: CapturedStory[];
  failed: number;
  deadlineHit: boolean;
}

/**
 * Screenshot each resolved story against a static server for the built Storybook.
 *
 * Fail-fast, not time-out: each story gets a short render budget and the whole
 * capture has a wall-clock deadline set below the job's `timeout-minutes`. On the
 * deadline or a render failure the caller exits non-zero, because a job that hits
 * `timeout-minutes` is *cancelled* (escalated to a human) whereas a non-zero exit
 * is a *failure* (auto-routed to fix-review). Whatever captured cleanly is still
 * returned so a partial run surfaces a gallery.
 */
export async function captureStories(
  stories: StoryIndexEntry[],
  options: CaptureOptions,
): Promise<CaptureOutcome> {
  const server = await startStaticServer(options.staticDir, options.port);
  const browser = await chromium.launch();
  const captured: CapturedStory[] = [];
  let failed = 0;
  let deadlineHit = false;
  const startedAt = Date.now();

  try {
    for (const story of stories) {
      if (Date.now() - startedAt > options.deadlineMs) {
        deadlineHit = true;
        const unattempted = stories.length - captured.length - failed;
        console.error(
          `Capture deadline (${options.deadlineMs}ms) exceeded — stopping with ${unattempted} unattempted.`,
        );
        break;
      }

      console.log(`  Screenshotting: ${story.title} / ${story.name}`);
      const page = await browser.newPage();
      await page.setViewportSize(options.viewport);
      const url = `http://localhost:${options.port}/iframe.html?id=${story.id}&viewMode=story`;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        await page
          .waitForSelector('#storybook-root', { state: 'visible', timeout: RENDER_TIMEOUT_MS })
          .catch(() => {
            // Some stories render outside #storybook-root; continue anyway.
          });
        const buffer = await page.screenshot({ type: 'png' });
        captured.push({ story, buffer });
      } catch (error) {
        // A story that fails to render is one an agent can fix — count it so the
        // run exits non-zero and routes to fix-review.
        failed += 1;
        console.error(`Failed to capture ${story.id}: ${errorMessage(error)}`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
    await closeServer(server);
  }

  return { captured, failed, deadlineHit };
}

function startStaticServer(staticDir: string, port: number): Promise<Server> {
  const staticRoot = resolve(staticDir);
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      const urlPath = (req.url ?? '/').split('?')[0] ?? '/';
      // Reject any request that would escape the served Storybook build (CWE-22).
      const filePath = resolveStaticPath(staticRoot, urlPath);
      if (filePath === null) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
      try {
        const content = readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': mime });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(port, () => resolveServer(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
