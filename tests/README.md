# Test Harness

Regression suite for the Circle.so n8n community node. Every test hits the real Circle API against the live community. There is no sandbox — the `_test_` prefix safety guard is the defense.

## Setup

1. Copy `.env.test.example` to `.env.test` at the repo root.
2. Fill in your Circle API token and community ID:
   ```
   CIRCLE_API_TOKEN=your_real_token
   CIRCLE_COMMUNITY_ID=your_real_community_id
   ```
3. Create the persistent fixtures listed in `tests/fixtures.md` inside the live community (hidden `_test_general` space, `_test_smoke_tag` tag, baseline member).
4. Install dependencies: `npm install`

## Running

Run the full suite:
```
npm test
```

Run a single regression by file:
```
npm run test:one -- tests/regressions/list_spaces_smoke.ts
```

Check for orphaned test resources:
```
npm run test:cleanup
```

## What success looks like

```
PASS  list_spaces_smoke              Found _test_general in the list of spaces (id 12345)
PASS  guard_self_test                createPost rejected non-_test_ title before any API call
```

Two PASS lines, zero FAIL lines, exit code 0.

## What to do when a test fails

1. Read the plain-English FAIL message first — it tells you what went wrong.
2. Common causes:
   - **401**: Token is wrong, expired, or for the wrong community. Regenerate in Circle admin.
   - **403**: Token doesn't have permission. Check token scopes.
   - **404**: A persistent fixture is missing. Re-create it in Circle and update `tests/fixtures.md`.
   - **429**: Rate-limited. Wait 60 seconds and re-run.
   - **Network error**: Check your internet connection.
3. If you need the stack trace: `npm test -- --verbose`

## File layout

```
tests/
  fixtures.md          — persistent _test_ fixtures with Circle IDs
  cleanup.ts           — stub; prints pointer to orphan log
  README.md            — this file
  lib/
    preflight.ts       — env checks + KNOWN_DANGER_IDS blocklist
    guarded-client.ts  — Circle API client with _test_ prefix guard
    helpers.ts         — plainPass, plainFail, logOrphan
    index.ts           — re-exports
  regressions/
    list_spaces_smoke.ts   — proves auth + _test_general exists
    guard_self_test.ts     — proves the guard rejects bad input (zero API calls)
```

## Safety

The guard checks four things before any API call:
1. `CIRCLE_API_TOKEN` is loaded from `.env.test`
2. `CIRCLE_COMMUNITY_ID` is loaded from `.env.test`
3. Community ID is not in the `KNOWN_DANGER_IDS` blocklist
4. Every resource being touched has a name starting with `_test_`

If any check fails, the run stops with a `REFUSED:` message and no request hits Circle.
