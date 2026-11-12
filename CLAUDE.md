# CLAUDE.md

Guidelines for Claude Code and Anthropic agents interacting with this repository.

## Commands
- Build Engine: `cd packages/engine && bun run build`
- Run Tests: `cd packages/engine && bun test`
- Build All: `bun run build`
- Typecheck: `bun run typecheck`

## Architecture Highlights
- Engine Package: `@grok-engine/core` in `packages/engine`
- CLI: `@grok-engine/cli` in `packages/cli`
- Server App: `@grok-engine/cloud-server` in `apps/cloud-server`
- Framework: Hono + Web Standards (`fetch`, `Request`, `Response`)
- Persistence: Supabase (`@supabase/supabase-js`) + `InMemoryMemoryProvider` fallback
- MCP Standard: Remote HTTP/SSE streaming ONLY (no local child processes)
- Security Rules: Enforce `PROVENANCE_GUIDANCE` and `markUntrusted()` envelopes
- Tool Narrowing: `SELECTION_FLOOR = 12` dynamic 2-pass skill narrowing
- GenUI: Declarative A2UI JSON components (`A2UI.card`, `A2UI.chart`, `A2UI.table`, etc.)

Refer to `AGENTS.md` for full recipes and architectural contracts.
