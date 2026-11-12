import { describe, it, expect } from "vitest";
import { GrokHarness } from "../src/harness/index.js";
import { InMemoryMemoryProvider } from "../src/memory/index.js";
import { LLMProvider, LLMStreamChunk } from "../src/providers/types.js";
import { ToolDefinition, TurnEvent } from "../src/core/types.js";
import { A2UI } from "../src/genui/index.js";
import { isMarkedUntrusted } from "../src/rules/index.js";
import { createHarnessServer } from "../src/server/index.js";

/**
 * Mock LLM Provider for deterministic harness loop testing.
 */
class MockLLMProvider implements LLMProvider {
  readonly providerId = "mock-llm";
  readonly modelName = "mock-model-v1";
  private responses: LLMStreamChunk[][] = [];

  queueResponse(chunks: LLMStreamChunk[]) {
    this.responses.push(chunks);
  }

  async *generateStream(): AsyncIterable<LLMStreamChunk> {
    const nextResponse = this.responses.shift() || [
      { deltaText: "Default mock reply." },
    ];
    for (const chunk of nextResponse) {
      yield chunk;
    }
  }
}

describe("Grokbot Master Turn Execution Harness", () => {
  it("executes single turn and streams token deltas", async () => {
    const mockModel = new MockLLMProvider();
    mockModel.queueResponse([
      { deltaText: "Hello " },
      { deltaText: "world!" },
    ]);

    const memory = new InMemoryMemoryProvider();
    const harness = new GrokHarness({
      model: mockModel,
      memory,
    });

    const events: TurnEvent[] = [];
    const result = await harness.executeTurn({
      threadId: "test-thread-1",
      userMessage: "Hello!",
      onEvent: (e) => events.push(e),
    });

    expect(result.finalContent).toBe("Hello world!");
    expect(events.filter((e) => e.type === "token_delta").length).toBe(2);
    expect(events.some((e) => e.type === "turn_complete")).toBe(true);

    // Verify messages saved to memory
    const history = await memory.getConversationHistory("test-thread-1");
    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("assistant");
    expect(history[1].content).toBe("Hello world!");
  });

  it("handles tool calling loop, GenUI component emission and untrusted enveloping", async () => {
    const mockModel = new MockLLMProvider();

    // Turn 1: Model calls "get_analytics" tool
    mockModel.queueResponse([
      { deltaText: "Querying analytics..." },
      {
        toolCalls: [
          {
            id: "call-analytics-1",
            name: "get_analytics",
            arguments: { metric: "sales" },
          },
        ],
      },
    ]);

    // Turn 2: Model uses tool output to formulate final response
    mockModel.queueResponse([
      { deltaText: "Here is your sales chart for Q3." },
    ]);

    const analyticsTool: ToolDefinition = {
      name: "get_analytics",
      description: "Fetches sales metrics",
      parameters: { type: "object" },
      execute: async () => {
        // Return an interactive GenUI chart
        return A2UI.chart({
          title: "Q3 Sales Trends",
          chartType: "bar",
          labels: ["Jul", "Aug", "Sep"],
          series: [{ name: "Revenue ($k)", data: [120, 150, 190] }],
        });
      },
    };

    const harness = new GrokHarness({
      model: mockModel,
      tools: [analyticsTool],
      enableUntrustedEnveloping: true,
    });

    const events: TurnEvent[] = [];
    const result = await harness.executeTurn({
      threadId: "test-thread-tools",
      userMessage: "Show me Q3 analytics",
      onEvent: (e) => events.push(e),
    });

    expect(result.finalContent).toBe("Here is your sales chart for Q3.");

    // Verify GenUI event was emitted
    const genUiEvent = events.find((e) => e.type === "genui_component");
    expect(genUiEvent).toBeDefined();

    // Verify tool result was enveloped with untrusted tag
    const toolResultEvent = events.find(
      (e) => e.type === "tool_call_result"
    ) as any;
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent.toolName).toBe("get_analytics");
  });

  it("Universal Cloud HTTP API serves health and SSE stream", async () => {
    const mockModel = new MockLLMProvider();
    mockModel.queueResponse([{ deltaText: "Server response streamed." }]);

    const harness = new GrokHarness({ model: mockModel });
    const app = createHarnessServer({ harness });

    // Test health endpoint
    const healthReq = new Request("http://localhost/api/health");
    const healthRes = await app.fetch(healthReq);
    expect(healthRes.status).toBe(200);
    const healthJson = await healthRes.json();
    expect(healthJson.status).toBe("healthy");
    expect(healthJson.service).toBe("@grokbot/harness");

    // Test SSE chat stream endpoint
    const chatReq = new Request("http://localhost/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: "sse-thread",
        message: "Stream this response",
      }),
    });

    const chatRes = await app.fetch(chatReq);
    expect(chatRes.status).toBe(200);
    expect(chatRes.headers.get("Content-Type")).toContain("text/event-stream");

    const textOutput = await chatRes.text();
    expect(textOutput).toContain("event: token_delta");
    expect(textOutput).toContain("Server response streamed.");
    expect(textOutput).toContain("event: turn_complete");
  });
});
