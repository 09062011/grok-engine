import { ChatMessage, ToolCall, ToolDefinition } from "../core/types.js";

export interface LLMStreamChunk {
  deltaText?: string;
  toolCalls?: ToolCall[];
  finishReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface GenerateStreamOptions {
  messages: ChatMessage[];
  systemInstruction?: string;
  tools?: ToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

/**
 * Common pluggable LLM provider contract.
 */
export interface LLMProvider {
  readonly providerId: string;
  readonly modelName: string;

  /**
   * Generates a streaming response from the model.
   */
  generateStream(
    options: GenerateStreamOptions
  ): AsyncIterable<LLMStreamChunk>;
}
