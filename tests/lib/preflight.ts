/**
 * Preflight — runs once at the top of every regression file.
 *
 * Three checks before any API call:
 *   1. CIRCLE_ADMIN_V1_API is loaded
 *   2. CIRCLE_COMMUNITY_ID is loaded
 *   3. Community ID is not in the KNOWN_DANGER_IDS blocklist
 *
 * Returns a GuardedCircleClient ready to use.
 */

import { GuardedCircleClient } from "./guarded-client.js";

/**
 * Hardcoded blocklist of community IDs the harness will never run against.
 * Initially empty. Grows the first time I scare myself.
 * Lives here (version-controlled) so it can't be tampered with by a
 * misconfigured env file.
 */
const KNOWN_DANGER_IDS: string[] = [];

function die(message: string): never {
  console.error(`REFUSED: ${message}`);
  process.exit(1);
}

export function preflight(): GuardedCircleClient {
  const token = process.env.CIRCLE_ADMIN_V1_API ?? "";
  const communityId = process.env.CIRCLE_COMMUNITY_ID ?? "";

  if (!token) {
    die(
      "CIRCLE_ADMIN_V1_API is missing. " +
        "Did you run with --env-file=.env.test?"
    );
  }

  if (!communityId) {
    die(
      "CIRCLE_COMMUNITY_ID is missing. " +
        "Did you run with --env-file=.env.test?"
    );
  }

  if (KNOWN_DANGER_IDS.includes(communityId)) {
    die(
      `community ${communityId} is in the harness blocklist. ` +
        "This ID was added because a previous run was almost catastrophic. " +
        "Refusing to proceed."
    );
  }

  return new GuardedCircleClient(token, communityId);
}
