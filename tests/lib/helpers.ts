/**
 * Plain-English test output helpers.
 *
 * plainPass / plainFail print one line per test.
 * logOrphan appends to notes/test-orphans.log when teardown can't
 * delete a fresh resource.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const ORPHAN_LOG = join(REPO_ROOT, "notes", "test-orphans.log");

// ── pass / fail ────────────────────────────────────────────────────────

export function plainPass(testName: string, message: string): void {
  console.log(`PASS  ${testName.padEnd(30)} ${message}`);
}

export function plainFail(testName: string, message: string): never {
  console.error(`FAIL  ${testName.padEnd(30)} ${message}`);
  process.exit(1);
}

/**
 * Translate a Circle API error into a plain-English hint.
 * Called inside catch blocks so the first thing you see is English,
 * not a stack trace.
 */
export function translateError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const status = (err as any).status as number | undefined;
  const msg = err.message;

  if (status === 401) {
    return (
      "Your CIRCLE_API_TOKEN is wrong, expired, or for the wrong community. " +
      `(${msg})`
    );
  }
  if (status === 403) {
    return (
      "The token is valid but doesn't have permission for this operation. " +
      `(${msg})`
    );
  }
  if (status === 404) {
    return (
      "Resource not found. If this is a persistent fixture, re-create it " +
      `in the live community and update tests/fixtures.md. (${msg})`
    );
  }
  if (status === 429) {
    return `Circle rate-limited us. Wait 60s and re-run. (${msg})`;
  }
  if (
    msg.includes("fetch failed") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ENOTFOUND")
  ) {
    return `Couldn't reach Circle at all. Check your network. (${msg})`;
  }

  return msg;
}

// ── orphan logging ─────────────────────────────────────────────────────

export interface FreshResource {
  kind: string;
  id: string | number;
  deleter: () => Promise<void>;
}

export function logOrphan(
  resource: { kind: string; id: string | number },
  error: unknown
): void {
  const line =
    `${resource.kind}\t${resource.id}\t${new Date().toISOString()}` +
    `\t${error instanceof Error ? error.message : String(error)}\n`;

  try {
    mkdirSync(join(REPO_ROOT, "notes"), { recursive: true });
    appendFileSync(ORPHAN_LOG, line);
    console.error(
      `note: teardown failed for ${resource.kind} ${resource.id} — see notes/test-orphans.log`
    );
  } catch {
    console.error(
      `note: teardown failed for ${resource.kind} ${resource.id} and could not write to orphan log`
    );
  }
}
