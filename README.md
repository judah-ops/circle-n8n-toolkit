# circle-n8n-toolkit

A free, open-source n8n community node for Circle.so.

For teams who want to leave Zapier and Make for n8n but are blocked by the HTTP node.

## Status

Phase 0.5 — test harness. No node code yet.

## Why

Circle.so is a great community platform but has weak native automation tooling. Existing options:
- Zapier and Make have Circle integrations but cost money per task and don't handle the full Circle API surface.
- The n8n HTTP node can technically hit any Circle endpoint but requires you to build every request by hand, manage auth, parse responses, and rebuild the same wiring on every new workflow.

This toolkit gives n8n users a real Circle node with sensible operations, real credential management, and a regression-tested API surface.

## Scope

See `scope/v1-scope.md` for the v1 operation list.

## License

MIT
