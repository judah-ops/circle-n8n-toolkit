/**
 * Regression: get_member
 *
 * Proves: getMember returns a member with expected fields,
 * the safety guard's assertTestPrefix + plusSegment runs against
 * a real API response (the baseline member's email is plus-addressed
 * with _test_ prefix).
 *
 * Uses the persistent _test_baseline member. No fresh resources.
 * No teardown needed.
 */

import { test } from "node:test";
import { preflight, plainPass, plainFail, translateError } from "../lib/index.js";

const TEST_NAME = "get_member";

test(TEST_NAME, async () => {
  const client = preflight();
  const memberId = Number(process.env.CIRCLE_TEST_BASELINE_MEMBER_ID);

  if (!memberId) {
    plainFail(TEST_NAME, "CIRCLE_TEST_BASELINE_MEMBER_ID is missing from .env.test");
  }

  try {
    const member = await client.getMember(memberId);

    // Guard already ran inside getMember (assertTestPrefix on plusSegment of email).
    // If we got here, the guard passed — the member's email contains +_test_.

    const hasId = typeof member.id === "number";
    const hasEmail = typeof member.email === "string" && member.email.length > 0;
    const hasName = typeof member.name === "string";

    if (hasId && hasEmail && hasName) {
      plainPass(
        TEST_NAME,
        `Fetched member ${member.id} (${member.email}) — id, email, name present`
      );
    } else {
      const missing = [
        !hasId && "id",
        !hasEmail && "email",
        !hasName && "name",
      ].filter(Boolean).join(", ");
      plainFail(TEST_NAME, `Member response missing fields: ${missing}`);
    }
  } catch (err) {
    plainFail(TEST_NAME, translateError(err));
  }
});
