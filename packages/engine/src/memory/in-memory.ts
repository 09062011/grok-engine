import { randomUUID } from "node:crypto";
import { ChatMessage } from "../core/types.js";
import { MemoryEntry, MemoryProvider } from "./types.js";

/**
 * In-memory reference implementation of MemoryProvider for zero-config testing and offline runs.
 */
export class InMemoryMemoryProvider implements MemoryProvider {
  private memories = new Map<string, MemoryEntry>();
  private threads = new Map<string, ChatMessage[]>();

  async saveMemory(
    entry: Omit<MemoryEntry, "id" | "updatedAt"> & { id?: string }
  ): Promise<MemoryEntry> {
    const id = entry.id || randomUUID();
    const saved: MemoryEntry = {
      ...entry,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.memories.set(id, saved);
    return saved;
  }

  async getEssentialMemories(params: {
    userId?: string;
    agentId?: string;
  }): Promise<MemoryEntry[]> {
    return Array.from(this.memories.values())
      .filter((m) => {
        if (m.inclusion !== "essential") return false;
        if (params.userId && m.userId && m.userId !== params.userId) return false;
        if (params.agentId && m.agentId && m.agentId !== params.agentId) return false;
        return true;
      })
      .sort((a, b) => {
        // Manual entries take precedence over automatic
        if (a.origin === "manual" && b.origin !== "manual") return -1;
        if (b.origin === "manual" && a.origin !== "manual") return 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  async searchMemories(params: {
    query: string;
    userId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<MemoryEntry[]> {
    const terms = params.query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const limit = params.limit || 5;

    const matched = Array.from(this.memories.values()).filter((m) => {
      if (params.userId && m.userId && m.userId !== params.userId) return false;
      if (params.agentId && m.agentId && m.agentId !== params.agentId) return false;
      if (terms.length === 0) return true;
      const lowerText = m.text.toLowerCase();
      return terms.some((term) => lowerText.includes(term));
    });

    return matched.slice(0, limit);
  }

  async deleteMemory(id: string): Promise<void> {
    this.memories.delete(id);
  }

  async saveMessage(threadId: string, message: ChatMessage): Promise<void> {
    const current = this.threads.get(threadId) || [];
    current.push({
      ...message,
      id: message.id || randomUUID(),
      timestamp: message.timestamp || new Date().toISOString(),
    });
    this.threads.set(threadId, current);
  }

  async getConversationHistory(
    threadId: string,
    limit?: number
  ): Promise<ChatMessage[]> {
    const current = this.threads.get(threadId) || [];
    if (!limit || current.length <= limit) return [...current];
    return current.slice(current.length - limit);
  }
}
