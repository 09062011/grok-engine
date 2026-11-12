import { ChatMessage } from "../core/types.js";

/**
 * An individual memory atom.
 */
export interface MemoryEntry {
  id: string;
  text: string;
  inclusion: "essential" | "searchable";
  origin: "manual" | "automatic";
  userId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
  updatedAt: string;
}

/**
 * Universal memory and conversation store contract.
 */
export interface MemoryProvider {
  /**
   * Save or update a memory entry.
   */
  saveMemory(
    entry: Omit<MemoryEntry, "id" | "updatedAt"> & { id?: string }
  ): Promise<MemoryEntry>;

  /**
   * Retrieve essential memories budgeted for continuous in-prompt injection.
   */
  getEssentialMemories(params: {
    userId?: string;
    agentId?: string;
  }): Promise<MemoryEntry[]>;

  /**
   * Search through historical searchable memories.
   */
  searchMemories(params: {
    query: string;
    userId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<MemoryEntry[]>;

  /**
   * Delete a memory entry.
   */
  deleteMemory(id: string): Promise<void>;

  /**
   * Persist a chat message into a thread.
   */
  saveMessage(threadId: string, message: ChatMessage): Promise<void>;

  /**
   * Retrieve conversation history for a thread in chronological order.
   */
  getConversationHistory(
    threadId: string,
    limit?: number
  ): Promise<ChatMessage[]>;
}
