#!/usr/bin/env node
import http from "node:http";
import {
  GrokHarness,
  GeminiProvider,
  InMemoryMemoryProvider,
  createHarnessServer,
} from "@grok-engine/core";

const command = process.argv[2] || "help";

async function main() {
  switch (command) {
    case "start":
    case "serve": {
      const port = Number(process.env.PORT) || 3060;
      const apiKey = process.env.GEMINI_API_KEY || "dummy_key";
      const harness = new GrokHarness({
        model: new GeminiProvider({ apiKey }),
        memory: new InMemoryMemoryProvider(),
      });
      const app = createHarnessServer({ harness });

      const server = http.createServer((req, res) => {
        const url = `http://${req.headers.host || "localhost"}${req.url}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        }

        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          const body = ["GET", "HEAD"].includes(req.method || "")
            ? undefined
            : Buffer.concat(chunks);
          const webReq = new Request(url, { method: req.method, headers, body });
          const webRes = await app.fetch(webReq);
          res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
          if (webRes.body) {
            const reader = webRes.body.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(value);
            }
          }
          res.end();
        });
      });

      server.listen(port, "0.0.0.0", () => {
        console.log(`Grok Engine CLI Server listening on http://localhost:${port}`);
        console.log(`Health endpoint: http://localhost:${port}/api/health`);
        console.log(`Chat stream endpoint: http://localhost:${port}/api/chat/stream`);
      });
      break;
    }

    case "health": {
      const targetUrl = process.argv[3] || "http://localhost:3060/api/health";
      try {
        const res = await fetch(targetUrl);
        const json = await res.json();
        console.log("Health Status:", JSON.stringify(json, null, 2));
      } catch (err: any) {
        console.error("Healthcheck failed:", err.message);
      }
      break;
    }

    case "help":
    default:
      console.log(`
Grok Engine CLI (@grok-engine/cli)

Usage:
  grok-engine <command> [options]

Commands:
  start | serve   Start local Grok Engine server on PORT (default: 3060)
  health [url]    Ping healthcheck endpoint (default: http://localhost:3060/api/health)
  help            Show this help manual
`);
      break;
  }
}

main().catch(console.error);
