import { ChatMessage, ToolDefinition } from "../core/types.js";
import {
  GenerateStreamOptions,
  LLMProvider,
  LLMStreamChunk,
} from "./types.js";

export interface OpenAIProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  providerId?: string;
}

export class OpenAIProvider implements LLMProvider {
  readonly providerId: string;
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(options: OpenAIProviderOptions = {}) {
    this.providerId = options.providerId || "openai";
    this.modelName = options.model || "gpt-4o";
    const key = options.apiKey || process.env.OPENAI_API_KEY || process.env.XAI_API_KEY;
    if (!key) {
      throw new Error(
        `OpenAIProvider (${this.providerId}) requires an API key in options or OPENAI_API_KEY / XAI_API_KEY env.`
      );
    }
    this.apiKey = key;
    this.baseUrl = (options.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  private mapMessages(messages: ChatMessage[], systemInstruction?: string): any[] {
    const formatted: any[] = [];
    if (systemInstruction) {
      formatted.push({ role: "system", content: systemInstruction });
    }

    for (const m of messages) {
      if (m.role === "tool") {
        formatted.push({
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId || "default_tool_call_id",
        });
      } else if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
        formatted.push({
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments:
                typeof tc.arguments === "string"
                  ? tc.arguments
                  : JSON.stringify(tc.arguments),
            },
          })),
        });
      } else {
        formatted.push({
          role: m.role,
          content: m.content,
        });
      }
    }

    return formatted;
  }

  private mapTools(tools?: ToolDefinition[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  async *generateStream(
    options: GenerateStreamOptions
  ): AsyncIterable<LLMStreamChunk> {
    const messages = this.mapMessages(options.messages, options.systemInstruction);
    const tools = this.mapTools(options.tools);

    const bodyPayload: any = {
      model: this.modelName,
      messages,
      stream: true,
    };
    if (tools) {
      bodyPayload.tools = tools;
    }
    if (options.temperature !== undefined) {
      bodyPayload.temperature = options.temperature;
    }
    if (options.maxOutputTokens !== undefined) {
      bodyPayload.max_tokens = options.maxOutputTokens;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: options.signal,
    });

    if (!response.ok) {
      throw new Error(
        `OpenAIProvider (${this.providerId}) API error ${response.status}: ${await response.text()}`
      );
    }

    if (!response.body) {
      throw new Error(`OpenAIProvider response stream is null`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const activeToolCalls = new Map<number, { id: string; name: string; args: string }>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (jsonStr === "[DONE]") break;

          let chunkJson: any;
          try {
            chunkJson = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          const choice = chunkJson.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          const streamChunk: LLMStreamChunk = {};

          if (delta?.content) {
            streamChunk.deltaText = delta.content;
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0;
              const existing = activeToolCalls.get(index) || {
                id: tc.id || `call_${Date.now()}_${index}`,
                name: tc.function?.name || "",
                args: "",
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;
              activeToolCalls.set(index, existing);
            }
          }

          if (choice.finish_reason) {
            streamChunk.finishReason = choice.finish_reason;
            if (activeToolCalls.size > 0) {
              streamChunk.toolCalls = Array.from(activeToolCalls.values()).map((tc) => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.args,
              }));
              activeToolCalls.clear();
            }
          }

          yield streamChunk;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
