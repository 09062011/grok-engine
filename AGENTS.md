# AGENTS.md — AI Agent Operating Manual & Architecture Contract

> **Target Audience**: AI Coding Assistants, LLM Autonomous Agents (Cursor, Claude Code, Antigravity, Devin, Copilot), and Human Developers.
> **Repository Purpose**: An ultra-modular, 100% cloud-native AI Agent Harness and Execution Engine (`@grok-engine/core`) with Supabase persistence, remote HTTP/SSE streaming MCPs, anti-hallucination guardrails, and declarative Generative UI (A2UI).

---

## 1. Architectural Invariants (DO NOT BREAK)

When working on or extending this codebase, any AI agent **MUST adhere to the following strict invariants**:

1. **Zero Subprocess Stdio MCPs**:
   - All MCP clients must use remote HTTP and Server-Sent Events (SSE) streaming ([`packages/engine/src/tools/http-mcp.ts`](./packages/engine/src/tools/http-mcp.ts)).
   - **NEVER** introduce `child_process.spawn("npx", ...)` or local stdio pipes for MCPs. This engine must run serverlessly in cloud environments (Cloudflare Workers, Supabase Edge, Vercel) where local OS child processes do not exist.

2. **Always Envelope Outside Content (`markUntrusted`)**:
   - Every external tool return, web page, API response, or database fetch **MUST** pass through `markUntrusted(content, source)` before entering the model's message history.
   - Embedded closing tags `</untrusted_data>` **MUST** remain escaped (`<\/untrusted_data`) to prevent indirect prompt injection.

3. **Preserve Provenance Guidance (`PROVENANCE_GUIDANCE`)**:
   - Never remove `PROVENANCE_GUIDANCE` from system prompt synthesis in [`executor.ts`](./packages/engine/src/harness/executor.ts). It enforces that the model cites tool sources and never invents regulatory figures, deadlines, numbers, or company policies.

4. **Preserve Synthetic Tool Resolution (`NO_ANSWER_CAME`)**:
   - If an assistant message contains `tool_calls` that were aborted or rejected by a human-in-the-loop, the harness **MUST** synthesize a tool response with `NO_ANSWER_CAME` before the next turn to prevent provider schema validation errors.

5. **Dynamic Tool Narrowing (`SELECTION_FLOOR = 12`)**:
   - When tools $\le 12$, offer all tools directly.
   - When tools $> 12$, run the skill-selector pass to narrow down active tools.
   - **FAIL OPEN**: If classification fails or returns empty, always offer all tools rather than denying capabilities.

6. **Dual-Tier Memory Budgeting**:
   - **Essential Memories**: Strict byte budget (default 4096 bytes) packed with manual user preferences taking priority over automatic observations.
   - **Searchable Memories**: Retrieved on-demand via PostgreSQL Full-Text Search (FTS) or pgvector.

---

## 2. Repository Layout & File Map

```
grok-engine/
├── AGENTS.md                          # <-- YOU ARE HERE: AI Agent Operating Manual
├── CLAUDE.md                          # Claude / Anthropic fast instructions
├── README.md                          # Master developer README & copy-paste commands
├── pnpm-workspace.yaml                # Workspace configuration
├── package.json                       # Monorepo root
├── tsconfig.base.json                 # Shared TypeScript configuration
│
├── packages/
│   ├── engine/                        # Core Engine Package (@grok-engine/core)
│   │   ├── src/
│   │   │   ├── core/types.ts          # Core type contracts (ChatMessage, ToolDefinition, TurnEvent)
│   │   │   ├── router/classifier.ts   # Agent routing (Confidence >= 0.6 + Reachability)
│   │   │   ├── harness/executor.ts    # Master Turn Execution Harness & streaming loop
│   │   │   ├── rules/index.ts         # PROVENANCE_GUIDANCE, UNTRUSTED_TAG, markUntrusted
│   │   │   ├── memory/                # SupabaseMemoryProvider, InMemoryMemoryProvider, Compactor
│   │   │   ├── tools/                 # ToolRegistry, ToolNarrower, RemoteHttpMcpClient
│   │   │   ├── genui/                 # Declarative A2UI JSON schema & fluent builders
│   │   │   ├── providers/             # GeminiProvider, OpenAIProvider (xAI Grok compatible)
│   │   │   ├── server/handler.ts      # Web Standards fetch Request/Response handler (Hono)
│   │   │   └── index.ts               # Public exports
│   │   ├── tests/                     # 28 passing unit & integration tests
│   │   └── package.json
│   │
│   └── cli/                           # Developer CLI (@grok-engine/cli)
│       ├── src/index.ts               # CLI runner (`grok-engine start`, `grok-engine health`)
│       └── package.json
│
├── apps/
│   └── cloud-server/                  # Ready-to-deploy Cloud Server (Hono / Node / Bun)
│       ├── src/index.ts               # Full server entrypoint
│       └── package.json
│
├── cloud-examples/
│   ├── supabase-edge/index.ts         # Supabase Edge Functions (Deno.serve)
│   ├── cloudflare-worker/index.ts     # Cloudflare Workers (export default { fetch })
│   └── docker/Dockerfile              # Production container for Railway / Fly.io / AWS
│
├── supabase/
│   └── migrations/001_grokbot_tables.sql # Full SQL schema (threads, messages, memories, RLS)
│
└── docs/
    └── ARCHITECTURE_AND_INTEGRATION_GUIDE.md # Technical manual & sequence diagrams
```

---

## 3. Standard Recipes for AI Agents

### Recipe 1: How to Add a New Tool
1. Define the tool using the `ToolDefinition` interface:
   ```typescript
   import { ToolDefinition } from "@grok-engine/core";
   import { z } from "zod";

   export const weatherTool: ToolDefinition = {
     name: "get_weather",
     description: "Fetches current weather for a city",
     parameters: z.object({
       city: z.string().describe("City name"),
     }),
     execute: async (args: { city: string }) => {
       const res = await fetch(`https://api.weather.com/v1?q=${encodeURIComponent(args.city)}`);
       return await res.json();
     },
   };
   ```
2. Register the tool on the harness:
   ```typescript
   harness.registerTool(weatherTool);
   ```

---

### Recipe 2: How to Add a Generative UI (GenUI) Component Tool
Tools can emit live interactive components (Cards, Tables, Charts, Forms, Approval Modals) using the `A2UI` builder:
```typescript
import { ToolDefinition, A2UI } from "@grok-engine/core";

export const analyticsTool: ToolDefinition = {
  name: "show_analytics",
  description: "Renders an interactive sales bar chart",
  parameters: { type: "object" },
  execute: async () => {
    // Return an A2UI chart component
    return A2UI.chart({
      title: "Quarterly Revenue",
      chartType: "bar",
      labels: ["Q1", "Q2", "Q3", "Q4"],
      series: [{ name: "Revenue ($M)", data: [12.4, 15.1, 18.2, 22.0] }],
    });
  },
};
```
When executed, the harness detects this valid `A2UI` schema and emits a `genui_component` event over the SSE stream!

---

### Recipe 3: How to Connect a Remote HTTP/SSE MCP Server
Connect to any remote MCP server over HTTP/SSE without local subprocesses:
```typescript
import { RemoteHttpMcpClient } from "@grok-engine/core";

const slackMcp = new RemoteHttpMcpClient({
  name: "slack",
  endpointUrl: "https://mcp-slack.internal.cloud/api",
  headers: { Authorization: `Bearer ${process.env.SLACK_MCP_SECRET}` },
});

// Load remote tools into harness
await harness.connectMcp(slackMcp);
```

---

### Recipe 4: How to Configure a Multi-Agent Team
Define specialized agents with `reaches` (connectors/tools they access):
```typescript
const harness = new GrokHarness({
  model,
  memory,
  defaultAgentId: "general",
  agents: [
    {
      id: "general",
      name: "General Coordinator",
      roleDescription: "General user inquiries and everyday assistance",
      systemPrompt: "You are the general coordinator.",
    },
    {
      id: "dba",
      name: "Database Specialist",
      roleDescription: "SQL queries, table migrations, and database analytics",
      reaches: ["PostgreSQL", "Supabase", "Analytics DB"],
      systemPrompt: "You are a senior PostgreSQL DBA.",
      tools: [runQueryTool, tableStatsTool],
    },
  ],
});
```

---

## 4. Verification & Testing Commands for Agents

Whenever an AI agent modifies code in this repository, it **MUST** run and verify the build and tests:

```bash
# 1. Typecheck & Compile Core Engine
cd packages/engine
bun run build

# 2. Run Test Suite (Must pass all 28 tests)
bun test

# 3. Build CLI & Cloud Server
cd ../cli && bun run build
cd ../../apps/cloud-server && bun run build
```

---

## 5. Do's and Don'ts Checklist for AI Agents

- [x] **DO** use `markUntrusted(content, source)` on all external data before yielding it to the model.
- [x] **DO** keep all server handlers based on Web Standard `fetch` Request/Response (Hono).
- [x] **DO** maintain `SELECTION_FLOOR = 12` dynamic tool narrowing.
- [x] **DO** preserve synthetic resolution (`NO_ANSWER_CAME`) for aborted tool calls.
- [ ] **DON'T** spawn local child processes (`child_process.spawn`) for MCP servers.
- [ ] **DON'T** remove `PROVENANCE_GUIDANCE` from system prompt synthesis.
- [ ] **DON'T** hardcode tools into the core harness; keep everything plug-and-play.
