/**
 * Supabase Edge Function Deployment Template for Grok Engine
 * 
 * Deploy via: supabase functions deploy grok-engine
 */
import {
  GrokHarness,
  GeminiProvider,
  SupabaseMemoryProvider,
  createHarnessServer,
} from "@grok-engine/core";

// Initialize Supabase Cloud Memory Provider
const memory = new SupabaseMemoryProvider({
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  supabaseKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
});

// Initialize Model Provider
const model = new GeminiProvider({
  apiKey: Deno.env.get("GEMINI_API_KEY")!,
  model: "gemini-2.5-flash",
});

// Create the Harness
const harness = new GrokHarness({
  model,
  memory,
  enableProvenanceGuidance: true,
  enableUntrustedEnveloping: true,
});

// Create the Web Standard API Server
const app = createHarnessServer({
  harness,
  corsOrigin: "*",
});

// Deno / Supabase Edge runtime listener
Deno.serve(app.fetch);
