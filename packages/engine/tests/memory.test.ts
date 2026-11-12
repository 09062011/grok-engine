import { describe, it, expect } from "vitest";
import {
  InMemoryMemoryProvider,
  packEssentialMemories,
  sanitizeAndCompactHistory,
} from "../src/memory/index.js";
import { ChatMessage } from "../src/core/types.js";
import { NO_ANSWER_CAME } from "../src/rules/index.js";

describe("Memory Management & Compaction", () => {
  it("stores and queries essential vs searchable memories", async () => {
    const memory = new InMemoryMemoryProvider();

    await memory.saveMemory({
      text: "User prefers concise answers with typescript examples",
      inclusion: "essential",
      origin: "manual",
      userId: "u-123",
    });

    await memory.saveMemory({
      text: "Discussed project architecture on Tuesday",
      inclusion: "searchable",
      origin: "automatic",
      userId: "u-123",
    });

    const essential = await memory.getEssentialMemories({ userId: "u-123" });
    expect(essential.length).toBe(1);
    expect(essential[0].text).toContain("User prefers concise");

    const searchRes = await memory.searchMemories({
      query: "architecture",
      userId: "u-123",
    });
    expect(searchRes.length).toBe(1);
    expect(searchRes[0].text).toContain("Discussed project architecture");
  });

  it("prioritizes manual rules within byte budget", () => {
    const memories = [
      {
        id: "1",
        text: "Auto observation 1: likes dark mode",
        inclusion: "essential" as const,
        origin: "automatic" as const,
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        id: "2",
        text: "CRITICAL USER RULE: Never delete production records without explicit approval",
        inclusion: "essential" as const,
        origin: "manual" as const,
        updatedAt: "2026-01-02T00:00:00Z",
      },
    ];

    // Restrict budget so only one fits
    const packed = packEssentialMemories(memories, 85);
    expect(packed.length).toBe(1);
    expect(packed[0].origin).toBe("manual");
  });

  it("sanitizes orphaned tool calls with synthetic NO_ANSWER_CAME", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Check database table count" },
      {
        role: "assistant",
        content: "Checking...",
        toolCalls: [
          {
            id: "call-xyz",
            name: "db_count",
            arguments: {},
          },
        ],
      },
      // Note: No tool message followed! User asked a new question:
      { role: "user", content: "Actually, forget that. What time is it?" },
    ];

    const sanitized = sanitizeAndCompactHistory(history, 10);

    // Should insert synthetic tool response between assistant and next user message
    expect(sanitized.length).toBe(4);
    expect(sanitized[2].role).toBe("tool");
    expect(sanitized[2].toolCallId).toBe("call-xyz");
    expect(sanitized[2].content).toBe(NO_ANSWER_CAME);
    expect(sanitized[3].content).toBe("Actually, forget that. What time is it?");
  });
});
