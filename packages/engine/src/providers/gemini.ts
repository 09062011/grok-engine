import { GoogleGenAI } from "@google/genai";
import { ChatMessage, ToolDefinition } from "../core/types.js";
import {
  GenerateStreamOptions,
  LLMProvider,
  LLMStreamChunk,
} from "./types.js";

export interface GeminiProviderOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiProvider implements LLMProvider {
  readonly providerId = "google-gemini";
  readonly modelName: string;
  private client: GoogleGenAI;

  constructor(options: GeminiProviderOptions = {}) {
    const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GeminiProvider requires an API key passed in options or set in GEMINI_API_KEY environment variable."
      );
    }
    this.modelName = options.model || "gemini-2.5-flash";
    this.client = new GoogleGenAI({ apiKey });
  }

  private mapTools(tools?: ToolDefinition[]): any[] | undefined {
    if (!tools || tools.length === 0) return undefined;

    const functionDeclarations = tools.map((t) => {
      // Convert parameters to JSON schema if provided
      let parameters: Record<string, unknown> = {
        type: "object",
        properties: {},
      };
      if (t.parameters && typeof t.parameters === "object") {
        if ("shape" in t.parameters) {
          // Zod schema
          parameters = { type: "object", properties: {} };
        } else {
          parameters = t.parameters as Record<string, unknown>;
        }
      }

      return {
        name: t.name,
        description: t.description,
        parameters,
      };
    });

    return [{ functionDeclarations }];
  }

  private mapMessages(messages: ChatMessage[]): any[] {
    return messages.map((m) => {
      const role = m.role === "assistant" ? "model" : m.role === "tool" ? "tool" : "user";
      const parts: any[] = [];

      if (m.content) {
        parts.push({ text: m.content });
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        for (const tc of m.toolCalls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args:
                typeof tc.arguments === "string"
                  ? JSON.parse(tc.arguments)
                  : tc.arguments,
            },
          });
        }
      }

      if (m.role === "tool") {
        parts.push({
          functionResponse: {
            name: m.name || "unknown_tool",
            response: { content: m.content },
          },
        });
      }

      return { role, parts };
    });
  }

  async *generateStream(
    options: GenerateStreamOptions
  ): AsyncIterable<LLMStreamChunk> {
    const contents = this.mapMessages(options.messages);
    const tools = this.mapTools(options.tools);

    const config: any = {};
    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }
    if (tools) {
      config.tools = tools;
    }
    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
    }
    if (options.maxOutputTokens !== undefined) {
      config.maxOutputTokens = options.maxOutputTokens;
    }

    const responseStream = await this.client.models.generateContentStream({
      model: this.modelName,
      contents,
      config,
    });

    for await (const chunk of responseStream) {
      const deltaText = chunk.text;
      const functionCalls = chunk.functionCalls;

      const streamChunk: LLMStreamChunk = {};

      if (deltaText) {
        streamChunk.deltaText = deltaText;
      }

      if (functionCalls && functionCalls.length > 0) {
        streamChunk.toolCalls = functionCalls.map((fc: any, index: number) => ({
          id: `call_${Date.now()}_${index}`,
          name: fc.name,
          arguments: fc.args || {},
        }));
      }

      yield streamChunk;
    }
  }
}
