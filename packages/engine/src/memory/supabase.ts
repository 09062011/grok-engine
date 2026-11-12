import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ChatMessage } from "../core/types.js";
import { MemoryEntry, MemoryProvider } from "./types.js";

export interface SupabaseMemoryProviderOptions {
  supabaseUrl?: string;
  supabaseKey?: string;
  client?: SupabaseClient;
  tableNamePrefix?: string;
}

/**
 * Production cloud Supabase memory and conversation store.
 */
export class SupabaseMemoryProvider implements MemoryProvider {
  private client: SupabaseClient;
  private prefix: string;

  constructor(options: SupabaseMemoryProviderOptions) {
    if (options.client) {
      this.client = options.client;
    } else if (options.supabaseUrl && options.supabaseKey) {
      this.client = createClient(options.supabaseUrl, options.supabaseKey);
    } else {
      throw new Error(
        "SupabaseMemoryProvider requires either a SupabaseClient instance or supabaseUrl and supabaseKey."
      );
    }
    this.prefix = options.tableNamePrefix || "grokbot_";
  }

  private table(name: string): string {
    return `${this.prefix}${name}`;
  }

  async saveMemory(
    entry: Omit<MemoryEntry, "id" | "updatedAt"> & { id?: string }
  ): Promise<MemoryEntry> {
    const payload = {
      ...(entry.id ? { id: entry.id } : {}),
      user_id: entry.userId,
      agent_id: entry.agentId,
      text: entry.text,
      inclusion: entry.inclusion,
      origin: entry.origin,
      metadata: entry.metadata || {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from(this.table("memories"))
      .upsert(payload)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save memory to Supabase: ${error.message}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      agentId: data.agent_id,
      text: data.text,
      inclusion: data.inclusion,
      origin: data.origin,
      metadata: data.metadata,
      updatedAt: data.updated_at,
    };
  }

  async getEssentialMemories(params: {
    userId?: string;
    agentId?: string;
  }): Promise<MemoryEntry[]> {
    let query = this.client
      .from(this.table("memories"))
      .select("*")
      .eq("inclusion", "essential");

    if (params.userId) query = query.eq("user_id", params.userId);
    if (params.agentId) query = query.eq("agent_id", params.agentId);

    // Order: manual origin first, then most recently updated
    query = query
      .order("origin", { ascending: false })
      .order("updated_at", { ascending: false });

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to fetch essential memories from Supabase: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      agentId: row.agent_id,
      text: row.text,
      inclusion: row.inclusion,
      origin: row.origin,
      metadata: row.metadata,
      updatedAt: row.updated_at,
    }));
  }

  async searchMemories(params: {
    query: string;
    userId?: string;
    agentId?: string;
    limit?: number;
  }): Promise<MemoryEntry[]> {
    const limit = params.limit || 5;
    let query = this.client.from(this.table("memories")).select("*");

    if (params.userId) query = query.eq("user_id", params.userId);
    if (params.agentId) query = query.eq("agent_id", params.agentId);

    // PostgreSQL Full-Text Search or ILIKE fallback
    if (params.query.trim()) {
      query = query.textSearch("text", params.query.trim(), {
        type: "websearch",
        config: "english",
      });
    }

    query = query.order("updated_at", { ascending: false }).limit(limit);

    const { data, error } = await query;
    if (error) {
      // Fallback to simple ilike if textSearch index isn't created yet
      const fallbackQuery = this.client
        .from(this.table("memories"))
        .select("*")
        .ilike("text", `%${params.query.trim()}%`)
        .order("updated_at", { ascending: false })
        .limit(limit);

      const fallbackRes = await fallbackQuery;
      if (fallbackRes.error) {
        throw new Error(`Failed to search memories in Supabase: ${error.message}`);
      }
      return (fallbackRes.data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        agentId: row.agent_id,
        text: row.text,
        inclusion: row.inclusion,
        origin: row.origin,
        metadata: row.metadata,
        updatedAt: row.updated_at,
      }));
    }

    return (data || []).map((row) => ({
      id: row.id,
      userId: row.user_id,
      agentId: row.agent_id,
      text: row.text,
      inclusion: row.inclusion,
      origin: row.origin,
      metadata: row.metadata,
      updatedAt: row.updated_at,
    }));
  }

  async deleteMemory(id: string): Promise<void> {
    const { error } = await this.client
      .from(this.table("memories"))
      .delete()
      .eq("id", id);
    if (error) {
      throw new Error(`Failed to delete memory from Supabase: ${error.message}`);
    }
  }

  async saveMessage(threadId: string, message: ChatMessage): Promise<void> {
    const payload = {
      thread_id: threadId,
      role: message.role,
      content: message.content,
      name: message.name,
      tool_calls: message.toolCalls ? JSON.stringify(message.toolCalls) : null,
      tool_call_id: message.toolCallId,
      metadata: message.metadata || {},
      created_at: message.timestamp || new Date().toISOString(),
    };

    const { error } = await this.client
      .from(this.table("messages"))
      .insert(payload);

    if (error) {
      throw new Error(`Failed to save message to Supabase: ${error.message}`);
    }
  }

  async getConversationHistory(
    threadId: string,
    limit?: number
  ): Promise<ChatMessage[]> {
    let query = this.client
      .from(this.table("messages"))
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load conversation history from Supabase: ${error.message}`);
    }

    return (data || []).map((row) => ({
      id: row.id,
      role: row.role as ChatMessage["role"],
      content: row.content,
      name: row.name,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      toolCallId: row.tool_call_id,
      timestamp: row.created_at,
      metadata: row.metadata,
    }));
  }
}
