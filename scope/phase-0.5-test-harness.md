# Phase 0.5 — Test Harness Paper Design

> Status: paper design, finalized 2026-04-08. No code in this document. Implementation lands in a separate session per the Phase 0.5 gate (section 10).
>
> Pseudocode is intentionally language-agnostic — the implementation will be TypeScript, but this design should read cleanly to a non-TS reader.

## 1. What the harness is, and what it isn't

**The unusual constraint up front**: there is no separate sandbox Circle community. The live Circle community is the only one we have, and `_test_` resources (spaces, members, tags, posts) live inside it side-by-side with real production data. There is no air-gap between the harness and live members. **The `_test_` prefix safety guard is not defense in depth — it is the defense.** Every section below has been written with that constraint in mind.

**It is**: a tiny test runner that exercises real Circle API endpoints against the live Circle community, with a safety guard that refuses to touch any resource whose name doesn't start with `_test_`. Every regression in `tests/regressions/` is a single self-contained file that follows the same template (section 4). One command runs the whole suite (`npm test`). Every failure prints a plain-English sentence before any stack trace.

**It isn't**:
- An n8n workflow runner. Regressions don't load workflow JSON; they call the Circle API directly via a guarded client. (When the n8n node ships in Phase 1, regressions for individual operations will call the *node's* code, not raw API. The harness scaffolding stays the same.)
- A unit-test framework. Mocks are out of scope. Every regression hits the real Circle API, with one deliberate exception: the guard self-test (section 10, gate item 6) makes zero API calls because its job is to prove the guard rejects bad input *before* anything reaches Circle.
- A full coverage suite at gate time. The 0.5 gate ships **the framework + one read-path smoke regression + one guard self-test**. The other v1 op regressions land per-PR in Phase 1, alongside the node code that needs them. This is the smallest gate that still proves the harness is safe.
- A CI runner. (CI = "continuous integration": a service like GitHub Actions that runs your tests automatically every time you push code, instead of you running them by hand. Phase 0.5 runs locally on my laptop, by hand. I add CI later, after the harness has proven itself and after the project grows past one contributor. Phase 2+ concern.)

> **Confirmed (Decision 0 — gate scope)**: framework + 1 read-path smoke (`list spaces returns _test_general`) + 1 guard self-test. The point of Phase 0.5 is to prove the harness exists and is safe, not to prove Circle's API works. The smoke exercises auth, the safety guard against a real list response, the `_test_` prefix assertion against real data, and the plain-English failure translator. The guard self-test proves the rejection path actually fires, with zero mutations and zero API calls.

---

## 2. Production safety guard contract

The guard is a precondition every regression runs before it touches anything. If any check fails, the run stops with a loud, plain-English error and **no API call is made**. Because the harness shares its Circle community with live data, the guard is the only thing standing between a buggy test and a real production resource.

**Plain English**: Before any test does anything, the harness checks three preflight conditions and refuses to start unless all three pass. Then, on every API call that touches a specific resource, a fourth per-call check runs:

1. The Circle API token is loaded (from `.env.test`, not from a shell export, not from a prod credential).
2. A target community ID is loaded (also from `.env.test`).
3. That community ID is NOT in a hardcoded blocklist of "known-dangerous" IDs that I have deliberately marked off-limits. The blocklist is empty today and grows the first time I scare myself.
4. (Per call) Any resource the test is about to touch has a name that starts with `_test_`. For member emails using plus-addressing (e.g. `user+_test_baseline@gmail.com`), the harness extracts the plus-segment (`_test_baseline`) before checking — see `plus_segment` in the pseudocode below.

A fifth structural rule covers the never-auto-send case (section 2b below): the guarded client has no method that sends DMs, and the one method that could mail a real human (`createMember`) requires opting in twice.

### 2a. Pseudocode (language-agnostic)

```
# Hardcoded blocklist of community IDs the harness will never run against,
# regardless of what's in .env.test. Initially empty. Grows the first time
# I scare myself. Lives in tests/lib/preflight.ts so it's
# version-controlled and can't be tampered with by a misconfigured env file.
const KNOWN_DANGER_IDS = []

# preflight runs once at the top of every regression file
function preflight():
    token        = read_env("CIRCLE_API_TOKEN")
    community_id = read_env("CIRCLE_COMMUNITY_ID")

    if token is empty:
        die("REFUSED: CIRCLE_API_TOKEN is missing. " +
            "Did you run with --env-file=.env.test?")
    if community_id is empty:
        die("REFUSED: CIRCLE_COMMUNITY_ID is missing. " +
            "Did you run with --env-file=.env.test?")
    if community_id in KNOWN_DANGER_IDS:
        die("REFUSED: community " + community_id + " is in the harness " +
            "blocklist. This ID was added because a previous run was " +
            "almost catastrophic. Refusing to proceed.")

    return GuardedCircleClient(token, community_id)


# every method on GuardedCircleClient runs assertTestPrefix on the resource
# before delegating to the raw API. Read-list methods (list*) are the one
# exception: they return everything in the community, including live data,
# and the regression is responsible for filtering. Any subsequent get/
# create/update/delete will go through a guarded method that asserts.
class GuardedCircleClient:

    # ----- v1 scope: list -----

    method listSpaces():
        return raw_api.get("/spaces")

    method listMembers(filters):
        return raw_api.get("/community_members", filters)

    # ----- v1 scope: get -----

    method getSpace(id):
        space = raw_api.get("/spaces/" + id)
        assertTestPrefix(space.name, "space")
        return space

    method getMember(id_or_email):
        member = raw_api.get("/community_members/" + id_or_email)
        assertTestPrefix(plus_segment(member.email), "member email")
        return member

    method getPost(id):
        post = raw_api.get("/posts/" + id)
        assertTestPrefix(post.title, "post title")
        return post

    # ----- v1 scope: create -----

    method createPost(space_id, title, body):
        assertTestPrefix(title, "post title")
        # title assert runs FIRST so a bad title fails before any HTTP call.
        # This is what makes the guard self-test (gate item 6) zero-API-call.
        self.getSpace(space_id)   # asserts the parent space is _test_ too
        return raw_api.post("/spaces/" + space_id + "/posts", { title, body })

    method createMember(email, name):
        assertTestPrefix(plus_segment(email), "member email")
        if env("HARNESS_ALLOW_INVITES") != "1":
            die("REFUSED: createMember would send a real invite email. " +
                "Set HARNESS_ALLOW_INVITES=1 only for tests you intentionally " +
                "want to send invites in.")
        return raw_api.post("/community_members",
                            { email, name, notify: false })

    # ----- v1 scope: tag mutations -----

    method addTag(member, tag_name):
        assertTestPrefix(plus_segment(member.email), "member email")
        assertTestPrefix(tag_name, "tag")
        return raw_api.post("/tagged_members",
                            { user_email: member.email, tag: tag_name })

    method removeTag(member, tag_name):
        assertTestPrefix(plus_segment(member.email), "member email")
        assertTestPrefix(tag_name, "tag")
        return raw_api.delete("/tagged_members",
                              { user_email: member.email, tag: tag_name })

    # ----- harness-internal: deletes for teardown -----
    # These are NOT part of the n8n node's v1 surface. They exist only so
    # regression teardown can clean up fresh resources. Same guard rules apply.

    method deletePost(post_id):
        post = raw_api.get("/posts/" + post_id)
        assertTestPrefix(post.title, "post title")
        return raw_api.delete("/posts/" + post_id)

    method deleteMember(member_id_or_email):
        member = raw_api.get("/community_members/" + member_id_or_email)
        assertTestPrefix(plus_segment(member.email), "member email")
        return raw_api.delete("/community_members/" + member_id_or_email)

    # NOTE: there is no sendDirectMessage method on this client.
    # DMs are out of v1 scope. The surface area literally has no function
    # that can mail a real human. See section 2b.


function assertTestPrefix(name, kind):
    # Single rule, no special cases. Callers that have a wrapped name
    # (like an email) are responsible for extracting the meaningful
    # segment first via plus_segment().
    if not name starts with "_test_":
        die("REFUSED: regression tried to touch a non-_test_ " + kind +
            ": '" + name + "'. The safety guard stopped it before any " +
            "request hit Circle.")


function plus_segment(email):
    # user+_test_smoke_1712606400@gmail.com → "_test_smoke_1712606400"
    # user@gmail.com (no plus) → "user" (which won't pass the assert,
    # which is the correct outcome — a non-plus-addressed email is not a
    # _test_ member)
    local = email.split("@")[0]
    if local contains "+":
        return local.split("+")[1]
    return local
```

### 2b. Why the safety guard stops sends, structurally

Three independent layers, all of which would have to fail at once:

1. **No method exists.** The `GuardedCircleClient` only exposes operations from the v1 scope plus harness-internal deletes. The v1 scope has zero DM/send-message operations. There is no function in the harness that can send a DM. To send one, a regression would have to bypass the guarded client and call the raw HTTP layer directly — which is the kind of thing PR review and the linter will catch.
2. **`createMember` is double-opt-in.** Circle's `POST /community_members` triggers an invite email by default. The guarded `createMember` (a) passes `notify: false` to Circle, AND (b) refuses to run unless `HARNESS_ALLOW_INVITES=1` is set in the env. Forgetting either one fails closed. For the Phase 0.5 smoke and guard self-test, `HARNESS_ALLOW_INVITES` is never set, so `createMember` is unreachable.
3. **The blocklist + the `_test_` prefix.** Even if a method somehow tried to touch live data, the per-call `assertTestPrefix` check refuses. And if the entire community were swapped out for a different one by a fat-fingered env file, the `KNOWN_DANGER_IDS` blocklist (when populated) would refuse to run against IDs I have explicitly marked off-limits.

> **Confirmed (Decision 1 — safety guard)**: four-check preflight (token loaded, community ID loaded, community ID not in `KNOWN_DANGER_IDS`, per-call `_test_` prefix on every guarded method) + GuardedCircleClient pattern + createMember double-opt-in. `KNOWN_DANGER_IDS` is hardcoded in `tests/lib/preflight.ts`, initially empty, version-controlled. Community ID lives in `.env.test` only, never in git. Email-prefix checks always go through `plus_segment` first, then `assertTestPrefix` — no special-case branch in `assertTestPrefix` itself.

> **Confirmed (Decision 4 — never-auto-send)**: structural impossibility achieved by all three layers above. The harness has no method to send a DM (the surface area literally lacks the function). `createMember` is double-opt-in via `notify: false` to Circle and a `HARNESS_ALLOW_INVITES=1` env requirement. For the Phase 0.5 smoke and guard self-test, `HARNESS_ALLOW_INVITES` is never set, so the only method that could mail a human is unreachable.

---

## 3. The `_test_` resource conventions

Naming rules for every resource type the v1 ops touch:

| Resource | Naming rule | Persistence | Created by |
|---|---|---|---|
| **Space** | `_test_<purpose>` (e.g. `_test_general`) | Persistent — created once manually in the live community | Manual, listed in `tests/fixtures.md` |
| **Tag** | `_test_<purpose>` (e.g. `_test_smoke_tag`) | Persistent — Circle tags are cheap and reusable | Manual, listed in `tests/fixtures.md` |
| **Baseline member** | `user+_test_baseline@gmail.com` (plus-addressing on my gmail) | Persistent — one shared member to attach tags to | Manual, listed in `tests/fixtures.md` |
| **Post** | `_test_<test_name>_<unix>` (e.g. `_test_create_post_smoke_1712606400`) | Fresh per run inside a `_test_` space | Test setup |
| **Ephemeral member** | `user+_test_<test_name>_<unix>@gmail.com` (plus-addressing) | Fresh per run | Test setup, gated by `HARNESS_ALLOW_INVITES` |

**Persistent vs fresh, in plain English**:
- *Persistent* fixtures (spaces, tags, baseline member) are created once by hand in the live Circle community, recorded in `tests/fixtures.md` with their Circle IDs, and never deleted by automation. If a persistent fixture goes missing, regressions fail loudly and I re-create it manually.
- *Fresh* resources (posts, ephemeral members) are created and destroyed by the test that uses them. Every fresh resource gets a unix timestamp suffix so two parallel runs don't collide.
- **Rule of thumb**: persistent for the scaffolding, fresh for anything a test mutates.

**Where the test data physically lives**: in the live Circle community, alongside live (non-`_test_`) resources. The community is not a sandbox. The only thing distinguishing test fixtures from live data is their `_test_` prefix and the safety guard that enforces it. `tests/fixtures.md` (committed to git) lists every persistent fixture by name and Circle ID, and identifies the community by **human name only** ("the live Circle community where I run the harness"). The numeric community ID lives in `.env.test`, never in git.

**Why plus-addressing on `user@gmail.com`**: every `user+_test_<anything>@gmail.com` address routes to my real inbox, but Circle treats each one as a distinct member. I see any invite emails that leak through (defense against the never-auto-send rule failing). No external domain to maintain. No risk of mailing a real person.

**Orphan cleanup** (when a fresh resource isn't deleted because the test crashed):
- The teardown step in every regression deletes its fresh resources via the appropriate `deleteX` method on the guarded client.
- If teardown itself fails, the resource ID is appended to `notes/test-orphans.log` (under `notes/`, which is gitignored, so the log never enters git).
- A `npm run test:cleanup` command exists in Phase 0.5 as a **stub**: it exits 0 and prints a one-line message pointing at the orphans log. See section 8 for the full teardown story.
- Until cleanup is automated, I open `notes/test-orphans.log`, open the Circle UI, delete manually, and clear the log. Two-minute ritual.

> **Confirmed (Decision 2 — `_test_` contract)**: persistent for scaffolding (spaces, tags, baseline member), fresh for anything a test mutates (posts, ephemeral members). Member emails use `user+_test_*@gmail.com` plus-addressing. Orphans log at `notes/test-orphans.log` (under gitignored `notes/`). Manual cleanup is a deliberate design choice given the maintenance budget and the blast radius — not a gap.

---

## 4. The regression workflow shape

Every file under `tests/regressions/` follows this template. PRs that add a new regression copy this template and fill in five blanks: name, fresh resources, action, assertion, plain-English log.

**Pseudocode template**:

```
# regression: <one-line description of what's being verified>

import { preflight, plainPass, plainFail, logOrphan } from "../lib"

const TEST_NAME = "<snake_case_test_name>"

# 1. PREFLIGHT — runs the four-check safety guard
const client = preflight()

# 2. SETUP — declare any fresh resources as { kind, id, deleter } tuples.
# The deleter is a closure that calls the right typed delete method on the
# guarded client. There is no generic client.delete() — every resource type
# has its own typed delete (deletePost, deleteMember, removeTag, etc.) so
# the guard's _test_ assertion can run against the right field.
const fresh = []

# example (illustrative — the Phase 0.5 smoke creates no fresh resources):
#   const post_title = "_test_" + TEST_NAME + "_" + now_unix()
#   const post = client.createPost(space_id, post_title, body)
#   fresh.push({
#       kind: "post",
#       id: post.id,
#       deleter: () => client.deletePost(post.id)
#   })

try {
    # 3. ACTION — the API call(s) being exercised
    const result = client.listSpaces()

    # 4. ASSERTION — single clear check, plain-English message on both branches
    const found = result.find(s => s.name == "_test_general")
    if (found) {
        plainPass(TEST_NAME,
            "Found _test_general in the list of spaces (id " + found.id + ")")
    } else {
        plainFail(TEST_NAME,
            "Expected to find a space named _test_general but the API returned: " +
            result.map(s => s.name).join(", "))
    }
} finally {
    # 5. TEARDOWN — call each fresh resource's typed deleter, log any failures
    for (const r of fresh) {
        try { r.deleter() }
        catch (e) { logOrphan(r, e) }
    }
}
```

**The five blanks** (every PR fills these):
1. `TEST_NAME` — snake_case, used in the log line
2. `fresh` — list of `{ kind, id, deleter }` tuples for resources this test creates and must clean up
3. The action under test — usually one or two `client.<op>(...)` calls
4. The assertion — single check, with both pass and fail messages written in plain English
5. (Implicit) the regression's filename, which matches `TEST_NAME`

**Hard rules** (enforced by review, not code):
- Every regression calls `preflight()` first. No exceptions.
- Every regression has a `finally` block that runs teardown, even on assertion failure.
- Every assertion uses `plainPass`/`plainFail`, never raw `assert`. The plain-English log line is mandatory.
- A regression touches at most one operation. A PR that touches two ops adds two regression files.
- Teardown failures never mask assertion failures (see section 8).
- No generic `client.delete(r)`. Each fresh resource carries a typed deleter closure that calls the specific `client.deleteX` method, so the guard's `assertTestPrefix` runs against the correct field.

> **Confirmed (Decision 3 — regression shape)**: this template, with the five blanks and the six hard rules. `preflight()` invoked at module-load time (top of file, runs once per regression file). `finally` block stays inline in the template (not extracted into a wrapper helper) so the test author can see the teardown they're responsible for. Fresh resources are `{ kind, id, deleter }` tuples; teardown calls each deleter (no generic delete).

---

## 5. How credentials and the target community are configured

**Where the token lives**:
- A file `.env.test` at the repo root holds `CIRCLE_API_TOKEN` and `CIRCLE_COMMUNITY_ID`.
- `.env.test` is gitignored (added to `.gitignore` as part of Phase 0.5 implementation).
- `.env.test.example` IS checked in, with placeholder values, so a fresh clone knows what to fill in.
- Loaded with `node --env-file=.env.test ...`. No `dotenv` runtime dependency. (Node 20+ has `--env-file` built in.)

**Where the community ID lives**:
- `CIRCLE_COMMUNITY_ID` is set in `.env.test` and ONLY in `.env.test`. It is never checked into git.
- The safety guard reads it at runtime. If it's unset, the run refuses. If it matches an entry in the hardcoded `KNOWN_DANGER_IDS` blocklist (initially empty, lives in `tests/lib/preflight.ts`), the run also refuses.
- `tests/README.md` documents the variable with a placeholder: `CIRCLE_COMMUNITY_ID=your_community_id_here`.
- `tests/fixtures.md` (which IS committed) names the community by HUMAN name only — e.g., "the live Circle community where I run the harness" — never by numeric ID.

**Why the community ID stays out of git**: this toolkit is a public OSS portfolio project. The community I run tests against is my day job, not a purpose-built test rig. Pinning that community ID in a checked-in file would (a) visibly tie the OSS repo to a specific organization in a way any reader can trace, (b) make that organization look like the project's test target in a way its leadership didn't sign up for, and (c) create a one-way door — the moment anyone forks the repo with that ID baked in, it can't be un-pinned. Treating the ID as runtime config from day one costs nothing and keeps the option open to swap to a dedicated throwaway community later.

**What never lives in git**: the API token, the community ID, the contents of `.env.test`, anything in `notes/`, anything that could authenticate against or identify a specific Circle community.

**1Password CLI deferred to Phase 2**: A 1Password-CLI-injected token would be more secure, but the current token is already scoped, revocable, and lives in a gitignored dotfile that never leaves my laptop. The threat model for a paper-design-phase OSS toolkit doesn't justify the setup tax, and the maintenance budget says no to anything that adds friction to "run the suite on a tired Tuesday." Revisit if and when the project grows a second contributor or starts running in CI.

> **Confirmed (Decision 7 — credentials and community config)**: `.env.test` (gitignored) holds both `CIRCLE_API_TOKEN` and `CIRCLE_COMMUNITY_ID`. `node --env-file=.env.test` to load. `.env.test.example` checked in with placeholders. `tests/README.md` documents both variables with placeholder values. `tests/fixtures.md` names the live community by human name only, never by numeric ID. `KNOWN_DANGER_IDS` blocklist is hardcoded in `tests/lib/preflight.ts`, initially empty, version-controlled. 1Password CLI deferred to Phase 2.

---

## 6. How a test run is invoked

**One command**: `npm test`

That's it. `npm test` resolves to:
```
node --env-file=.env.test --test --import tsx tests/regressions/
```

Translation:
- `--env-file=.env.test` loads the token and community ID
- `--test` runs Node's built-in test runner
- `--import tsx` lets the runner read TypeScript files without a compile step
- `tests/regressions/` is the directory the runner walks

**Why node's built-in test runner**: zero new test-framework devDependencies. Built into Node 20+. The output is plain-text and scriptable. Nothing to learn beyond `npm test`. The downside (smaller ecosystem than vitest/jest) doesn't matter for a project this small.

**Other commands** (Phase 0.5 ships these as stubs):
- `npm run test:one -- list_spaces_smoke` — run a single regression by name
- `npm run test:cleanup` — print a pointer to `notes/test-orphans.log` and exit (5-line stub; see section 8)

> **Confirmed (Decision 5a — test runner)**: `node --test` + `tsx` import. Zero framework devDependencies.

---

## 7. How failures are reported in plain English

The two helper functions `plainPass` and `plainFail` print one line per test:

```
PASS  list_spaces_smoke              Found _test_general in the list of spaces (id 12345)
FAIL  add_tag_to_member              Expected tag _test_smoke_tag on member user+_test_baseline@gmail.com after add, but member's tags were: [_test_other]
PASS  guard_self_test                createPost rejected non-_test_ title before any API call
---
2 passed, 1 failed
```

**On failure, the output also includes** (below the FAIL line):
- The Circle API call that triggered the failure: method, URL, response status, response body (truncated to 500 chars)
- A translation of common-case errors:
  - `401` → "Your CIRCLE_API_TOKEN is wrong, expired, or for the wrong community."
  - `403` → "The token is valid but doesn't have permission for this operation."
  - `404` → "Resource not found. If this is a persistent fixture, re-create it in the live community and update tests/fixtures.md."
  - `429` → "Circle rate-limited us. Wait 60s and re-run."
  - Network error → "Couldn't reach Circle at all. Check your network."
- The stack trace is **off by default**. To see it: `npm test -- --verbose`.

**Why this matters**: I don't read TypeScript fluently. The first thing I should see when a test fails is one English sentence about what went wrong. The TypeScript stack trace is the *last* thing, and only if asked.

> **Confirmed (Decision 5b — failure output)**: one-line-per-test format above, FAIL details below the line, common-case error translations, stack traces hidden by default behind `--verbose`.

---

## 8. The teardown story

**During a test run**:
- Each regression's `finally` block walks its `fresh` array and calls each tuple's `deleter()` closure.
- Deleters call typed delete methods on the `GuardedCircleClient` (`deletePost`, `deleteMember`, `removeTag`), each of which runs `assertTestPrefix` against the right field — even teardown can't accidentally delete a non-`_test_` resource.
- If a delete fails, an orphan entry is appended to `notes/test-orphans.log` (gitignored, under `notes/`). One line per orphan, with four fields: resource type, Circle resource ID, resource name, ISO-8601 timestamp.
- The test still finishes; orphans are not blocking.

**Teardown failures never mask assertion failures.** If a regression's assertion fails AND its teardown also fails:
- The test reports the **assertion failure** as the primary error, in plain English, in the failure output.
- The teardown failure is reported as a secondary note (`note: teardown also failed for resource <name> — see notes/test-orphans.log`).
- The orphan still gets logged.
- The test exits non-zero on the assertion failure.
- This matters because the alternative — teardown error overwriting assertion error — is the single most common way test harnesses lie to you about what actually broke.

**Between runs**:
- `npm run test:cleanup` is a **stub script** in Phase 0.5: roughly five lines, exits 0 after printing one line (`manual cleanup for now: see notes/test-orphans.log, automated cleanup lands in Phase 1`). The contract is locked in (the command exists, the name is right, `tests/README.md` documents it); the real implementation lands when there's an actual orphan to clean.
- Until then, I open `notes/test-orphans.log`, open the Circle UI, delete the matching resources manually, and clear the log. Two-minute ritual.
- **There is no global "delete all `_test_*` older than 24h" sweep.** A destructive cron-shaped thing operating on a pattern match against the live community is exactly the kind of automation that feels safe until the day a guard regex bug mass-deletes a real post that happens to start with `_test`. Per-test `finally` teardown plus eyeballing the orphans log once a week is the right amount of automation for this maintenance budget and this blast radius. Manual cleanup is a feature, not a gap.

**Persistent fixtures are never torn down by automation**. If a persistent fixture (a `_test_` space, tag, or baseline member) needs to be re-created, I do it by hand and update `tests/fixtures.md`.

**What happens if Circle goes down mid-run**: the `finally` block still tries to delete; the deletes themselves fail and append to `notes/test-orphans.log`; the test reports a clear "couldn't reach Circle" error; I re-run when Circle is back. Nothing is left in a half-state that requires database surgery, because Circle resources are independent.

> **Confirmed (Decision 6 — teardown)**: per-test `finally` teardown, orphans log at `notes/test-orphans.log` (one line per orphan: type, Circle ID, name, ISO timestamp), `npm run test:cleanup` is a 5-line stub in Phase 0.5 with the contract documented, real implementation in Phase 1, no global sweep, teardown errors never mask assertion errors. Each fresh resource is a `{ kind, id, deleter }` tuple; the deleter is a closure that calls the appropriate typed `deleteX` method (no generic `client.delete`).

---

## 9. What this document does NOT cover

- The actual TypeScript implementation of `GuardedCircleClient`, `preflight`, `plainPass`, `plainFail`, `plus_segment`. That's Phase 0.5 *implementation*, a separate session after this paper design is approved.
- `package.json`, `tsconfig.json`, `npm test` script registration. Same — implementation, not paper design.
- The 7 v1 op regressions beyond the smoke. They land per-PR in Phase 1.
- A token-validating preflight call (preflight currently only validates env, not the token itself; the token gets validated implicitly by the first real API call). Phase 1+ nice-to-have.
- CI integration (GitHub Actions or similar). Phase 2+, after the project grows past one contributor.
- 1Password CLI for token storage. Phase 2 revisit (see section 5).
- The n8n node code itself. Phase 1+, gated on this harness.
- DM operations and webhook triggers. Out of v1 scope entirely.

## 10. The Phase 0.5 gate, restated

Phase 0.5 is "done" and `src/` work can begin once **all of these are true**:

1. `scope/phase-0.5-test-harness.md` is committed (this document).
2. `tests/` directory exists with: `lib/` (preflight, guarded client, plain helpers, `KNOWN_DANGER_IDS` list, `plus_segment`, `assertTestPrefix`), `regressions/` (TWO files: one read-path smoke + one guard self-test), `fixtures.md`, `README.md`.
3. `package.json` exists with `npm test`, `npm run test:one`, and `npm run test:cleanup` wired up. No runtime deps. `test:cleanup` is the 5-line stub.
4. `.env.test.example` checked in; `.env.test` exists locally (gitignored) with a real token AND a real community ID.
5. **Smoke run passes**: `npm test` runs `tests/regressions/list_spaces_smoke.ts` against the live community and prints `PASS list_spaces_smoke ...`.
6. **Guard self-test passes**: `npm test` runs `tests/regressions/_guard_self_test.ts` (or similar name) and prints `PASS guard_self_test ...`. The self-test calls `client.createPost(any_space_id_value, "not_prefixed_title", "body")` and asserts that it throws a `REFUSED` error. Because `assertTestPrefix(title, ...)` runs *before* the `getSpace` call inside `createPost`, the rejection happens before any HTTP request leaves the laptop. **Zero API calls, zero mutations, zero risk.** This is the proof that the guard's rejection path actually fires.

Why gate item 6 is a synthetic self-test and not "rename a fixture": the smoke test is `listSpaces`, which (correctly per the assert policy) does not assert on returned items, so renaming a fixture would just make the `find()` fail with "not found" — the guard would never fire. And renaming a fixture means mutating a resource inside the live community, which is exactly what the safety story is supposed to prevent. The synthetic self-test proves the same thing without touching a live resource.

Items 2–6 are NOT in this paper-design document — they're the implementation work for the next session.
