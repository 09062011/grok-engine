/**
 * Cloudflare Worker Deployment Template for Grok Engine
 * 
 * Deploy via: wrangler deploy
 */
import {
  GrokHarness,
  GeminiProvider,
  SupabaseMemoryProvider,
  createHarnessServer,
} from "@grok-engine/core";

export interface Env {
  GEMINI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const memory = new SupabaseMemoryProvider({
      supabaseUrl: env.SUPABASE_URL,
      supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });

    const model = new GeminiProvider({
      apiKey: env.GEMINI_API_KEY,
      model: "gemini-2.5-flash",
    });

    const harness = new GrokHarness({
      model,
      memory,
    });

    const app = createHarnessServer({ harness });
    return app.fetch(request);
  },
};
