# v1 Scope

The minimum viable node ships with these operations. Anything not on this list is out of scope for v1.

## Operations

1. List members (with filter by tag, by space, by signup date range)
2. Get member by ID or email
3. Create member (invite to community)
4. Add tag to member
5. Remove tag from member
6. List spaces
7. Create post in space
8. Get post by ID

That's it. Eight operations. No DMs in v1 — DMs go through the headless API and are gated for safety.

## Credential

One credential type: Circle API token. Stored as standard n8n credential, never logged, never exported.

## Out of scope for v1

- Sending DMs (separate concern, headless API, safety-gated)
- Bulk operations (single-item only in v1)
- Webhooks (read-only consumption is enough for v1)
- Workflow automation triggers (just a regular node, not a trigger node)
- Pagination helpers beyond the basics
