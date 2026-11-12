import { serve } from "@hono/node-server";
import {
  GrokHarness,
  GeminiProvider,
  OpenAIProvider,
  SupabaseMemoryProvider,
  InMemoryMemoryProvider,
  RemoteHttpMcpClient,
  A2UI,
  createHarnessServer,
} from "@grok-engine/core";

const PORT = Number(process.env.PORT) || 8080;

// 1. Setup Model Provider (Gemini / OpenAI / xAI Grok)
const model = process.env.GEMINI_API_KEY
  ? new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY })
  : new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || "dummy_key",
      baseUrl: process.env.XAI_API_KEY ? "https://api.x.ai/v1" : undefined,
      model: process.env.MODEL_NAME || "grok-beta",
    });

// 2. Setup Memory Provider (Supabase or In-Memory fallback)
const memory =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseMemoryProvider({
        supabaseUrl: process.env.SUPABASE_URL,
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      })
    : new InMemoryMemoryProvider();

// 3. Assemble GrokHarness
const harness = new GrokHarness({
  model,
  memory,
  tools: [
    {
      name: "sample_analytics_chart",
      description: "Generates an interactive sales chart",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        return A2UI.chart({
          title: "Q3 Departmental Revenue",
          chartType: "bar",
          labels: ["Engineering", "Marketing", "Sales", "Support"],
          series: [{ name: "Revenue ($k)", data: [210, 85, 340, 110] }],
        });
      },
    },
  ],
  enableProvenanceGuidance: true,
  enableUntrustedEnveloping: true,
});

// 4. Optional Remote HTTP MCP Connection
if (process.env.REMOTE_MCP_URL) {
  const remoteMcp = new RemoteHttpMcpClient({
    name: "cloud_mcp",
    endpointUrl: process.env.REMOTE_MCP_URL,
    headers: process.env.REMOTE_MCP_TOKEN
      ? { Authorization: `Bearer ${process.env.REMOTE_MCP_TOKEN}` }
      : undefined,
  });
  await harness.connectMcp(remoteMcp);
}

// 5. Start Universal Server
const app = createHarnessServer({ harness, corsOrigin: "*" });

console.log(`Grok Engine Cloud Server listening on http://localhost:${PORT}`);
console.log(`Health endpoint: http://localhost:${PORT}/api/health`);
console.log(`Chat stream endpoint: http://localhost:${PORT}/api/chat/stream`);

serve({ fetch: app.fetch, port: PORT });
