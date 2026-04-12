/**
 * Regression: guard_self_test
 *
 * Proves: the safety guard's rejection path fires BEFORE any HTTP
 * request leaves the laptop. Zero API calls, zero mutations.
 *
 * Calls client.createPost() with a title that does NOT start with
 * _test_. The guard's assertTestPrefix(title, ...) runs before
 * getSpace(), so no network request is made.
 */

import { test } from "node:test";
import { preflight, plainPass, plainFail } from "../lib/index.js";

const TEST_NAME = "guard_self_test";

test(TEST_NAME, async () => {
  const client = preflight();

  try {
    // 999999 is a dummy space ID — the guard rejects before it's ever used.
    await client.createPost(999999, "not_prefixed_title", "body");

    // If we reach here, the guard didn't fire — that's a failure.
    plainFail(
      TEST_NAME,
      "createPost accepted a non-_test_ title without throwing. " +
        "The safety guard is broken."
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("REFUSED:")) {
      plainPass(
        TEST_NAME,
        "createPost rejected non-_test_ title before any API call"
      );
    } else {
      // Some other error — not the guard. That's also a failure.
      plainFail(
        TEST_NAME,
        `Expected a REFUSED error from the guard, but got: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
});
