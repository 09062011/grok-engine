import { ChatMessage } from "../core/types.js";
import { NO_ANSWER_CAME } from "../rules/index.js";
import { MemoryEntry } from "./types.js";

export interface CompactorOptions {
  maxPromptMemoryBytes?: number;
  maxHistoryTurns?: number;
}

const DEFAULT_MAX_MEMORY_BYTES = 4096;
const DEFAULT_MAX_HISTORY_TURNS = 20;

/**
 * Calculates byte size of text content in UTF-8.
 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Packs essential memories within a strict byte budget.
 *
 * Manual user rules/instructions always take priority over automatic observations.
 */
export function packEssentialMemories(
  memories: MemoryEntry[],
  maxBytes = DEFAULT_MAX_MEMORY_BYTES
): MemoryEntry[] {
  // Sort: manual first, then newest
  const sorted = [...memories].sort((a, b) => {
    if (a.origin === "manual" && b.origin !== "manual") return -1;
    if (b.origin === "manual" && a.origin !== "manual") return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const packed: MemoryEntry[] = [];
  let currentBytes = 0;

  for (const entry of sorted) {
    const entryBytes = byteLength(entry.text);
    if (currentBytes + entryBytes <= maxBytes) {
      packed.push(entry);
      currentBytes += entryBytes;
    }
  }

  return packed;
}

/**
 * Sanitizes and compacts conversation history before feeding into the LLM context.
 *
 * 1. Resolves orphaned tool calls with synthetic NO_ANSWER_CAME tool messages.
 * 2. Bounds history length to maxHistoryTurns.
 * 3. Validates message sequencing.
 */
export function sanitizeAndCompactHistory(
  history: ChatMessage[],
  maxTurns = DEFAULT_MAX_HISTORY_TURNS
): ChatMessage[] {
  if (history.length === 0) return [];

  // 1. Sliding window slice
  const sliced = history.length > maxTurns ? history.slice(history.length - maxTurns) : [...history];

  // 2. Scan and repair orphaned tool calls
  const repaired: ChatMessage[] = [];
  const pendingCalls = new Map<string, string>(); // id -> toolName

  for (const msg of sliced) {
    if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
      for (const call of msg.toolCalls) {
        pendingCalls.set(call.id, call.name);
      }
      repaired.push(msg);
      continue;
    }

    if (msg.role === "tool" && msg.toolCallId) {
      pendingCalls.delete(msg.toolCallId);
      repaired.push(msg);
      continue;
    }

    // If a user or assistant message arrives while tool calls are pending,
    // synthesize missing tool responses so provider schema constraints are not broken.
    if (pendingCalls.size > 0 && (msg.role === "user" || msg.role === "assistant")) {
      for (const [id, name] of pendingCalls.entries()) {
        repaired.push({
          role: "tool",
          name,
          toolCallId: id,
          content: NO_ANSWER_CAME,
          timestamp: new Date().toISOString(),
        });
      }
      pendingCalls.clear();
    }

    repaired.push(msg);
  }

  // If trailing assistant message left un-responded tool calls, complete them
  if (pendingCalls.size > 0) {
    for (const [id, name] of pendingCalls.entries()) {
      repaired.push({
        role: "tool",
        name,
        toolCallId: id,
        content: NO_ANSWER_CAME,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return repaired;
}
