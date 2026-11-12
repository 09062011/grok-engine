/**
 * Containerized Cloud Server for Railway, Fly.io, or AWS
 */
import { serve } from "@hono/node-server";
import {
  GrokHarness,
  GeminiProvider,
  OpenAIProvider,
  SupabaseMemoryProvider,
  createHarnessServer,
} from "@grok-engine/core";

const PORT = Number(process.env.PORT) || 8080;

const model = process.env.GEMINI_API_KEY
  ? new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY })
  : new OpenAIProvider({
      apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY,
      baseUrl: process.env.XAI_API_KEY ? "https://api.x.ai/v1" : undefined,
      model: process.env.MODEL_NAME || "grok-beta",
    });

const memory = new SupabaseMemoryProvider({
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

const harness = new GrokHarness({
  model,
  memory,
});

const app = createHarnessServer({ harness });

console.log(`Grok Engine Cloud Harness running on port ${PORT}`);
serve({ fetch: app.fetch, port: PORT });
