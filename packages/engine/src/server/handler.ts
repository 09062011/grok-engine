import { Hono } from "hono";
import { GrokHarness } from "../harness/executor.js";
import { TurnEvent } from "../core/types.js";

export interface CreateHarnessServerOptions {
  harness: GrokHarness;
  corsOrigin?: string;
  verifyAuth?: (req: Request) => Promise<{ userId?: string } | null>;
}

/**
 * Creates a universal, standards-compliant HTTP API server for Grokbot Harness.
 *
 * Runs natively on Cloudflare Workers, Supabase Edge Functions, Vercel, Node, Bun, and Docker.
 */
export function createHarnessServer(options: CreateHarnessServerOptions) {
  const app = new Hono();
  const { harness, verifyAuth } = options;

  // CORS middleware
  app.use("*", async (c, next) => {
    await next();
    c.res.headers.set("Access-Control-Allow-Origin", options.corsOrigin || "*");
    c.res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    c.res.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
  });

  app.options("*", (c) => c.text("OK", 200));

  // Healthcheck endpoint
  app.get("/api/health", (c) => {
    return c.json({
      status: "healthy",
      service: "@grokbot/harness",
      timestamp: new Date().toISOString(),
      provider: harness.model.providerId,
      model: harness.model.modelName,
    });
  });

  // Streaming Turn execution endpoint (SSE)
  app.post("/api/chat/stream", async (c) => {
    let userId: string | undefined;

    if (verifyAuth) {
      const authResult = await verifyAuth(c.req.raw);
      if (!authResult) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      userId = authResult.userId;
    }

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON request body" }, 400);
    }

    const { threadId, message, targetAgentId } = body;
    if (!threadId || !message) {
      return c.json(
        { error: "threadId and message are required fields" },
        400
      );
    }

    // Set up Server-Sent Events (SSE) stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: TurnEvent) => {
          const sseChunk = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseChunk));
        };

        try {
          await harness.executeTurn({
            threadId,
            userId,
            userMessage: message,
            targetAgentId,
            onEvent: sendEvent,
          });
        } catch (err: any) {
          sendEvent({
            type: "error",
            code: "TURN_EXECUTION_FAILED",
            message: err.message || String(err),
            fatal: true,
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });

  return app;
}
