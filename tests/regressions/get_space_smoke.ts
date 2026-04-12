/**
 * Regression: get_space_smoke
 *
 * Proves: auth works, the API returns data, the persistent
 * _test_general space exists, and the safety guard's assertTestPrefix
 * runs against a real API response.
 *
 * Uses getSpace(id) instead of listSpaces() because _test_general is
 * hidden from the space directory (correct — visible test spaces would
 * clutter the member sidebar). Hidden spaces don't appear in list
 * results but are accessible by ID.
 *
 * No fresh resources. No teardown needed.
 */

import { test } from "node:test";
import { preflight, plainPass, plainFail, translateError } from "../lib/index.js";

const TEST_NAME = "get_space_smoke";

test(TEST_NAME, async () => {
  const client = preflight();
  const spaceId = Number(process.env.CIRCLE_TEST_SPACE_ID);

  if (!spaceId) {
    plainFail(TEST_NAME, "CIRCLE_TEST_SPACE_ID is missing from .env.test");
  }

  try {
    const space = await client.getSpace(spaceId);

    if (space.name === "_test_general") {
      plainPass(
        TEST_NAME,
        `Fetched _test_general by ID (id ${space.id})`
      );
    } else {
      plainFail(
        TEST_NAME,
        `Expected space name '_test_general' but got '${space.name}'`
      );
    }
  } catch (err) {
    plainFail(TEST_NAME, translateError(err));
  }
});
