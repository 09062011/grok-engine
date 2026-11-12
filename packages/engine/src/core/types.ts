import { z } from "zod";

/**
 * Normalized chat message roles across all providers.
 */
export type MessageRole = "system" | "user" | "assistant" | "tool";

/**
 * Tool call requested by the model.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown> | string;
}

/**
 * Canonical chat message in the Grokbot harness.
 */
export interface ChatMessage {
  id?: string;
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution definition for the harness.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<unknown> | Record<string, unknown>;
  /**
   * Execute the tool.
   */
  execute: (
    args: any,
    context: {
      threadId: string;
      userId?: string;
      signal?: AbortSignal;
    }
  ) => Promise<unknown>;
  /**
   * Optional permission / human-in-the-loop requirement.
   */
  requiresApproval?: boolean;
}

/**
 * Skill bundle grouping related tools together.
 */
export interface SkillDefinition {
  slug: string;
  title: string;
  summary: string;
  tools: ToolDefinition[];
}

/**
 * Agent definition for routing and execution.
 */
export interface AgentDefinition {
  id: string;
  name: string;
  roleDescription: string;
  /**
   * Systems / connectors this agent can actually reach.
   */
  reaches?: string[];
  systemPrompt: string;
  tools?: (ToolDefinition | SkillDefinition)[];
  confidenceThreshold?: number;
}

/**
 * Turn streaming event types.
 */
export type TurnEventType =
  | "token_delta"
  | "tool_call_start"
  | "tool_call_result"
  | "genui_component"
  | "provenance_notice"
  | "turn_complete"
  | "error";

export interface TokenDeltaEvent {
  type: "token_delta";
  text: string;
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolCallResultEvent {
  type: "tool_call_result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export interface GenUIComponentEvent {
  type: "genui_component";
  componentId: string;
  component: unknown; // A2UIComponent
}

export interface ProvenanceNoticeEvent {
  type: "provenance_notice";
  sources: string[];
}

export interface TurnCompleteEvent {
  type: "turn_complete";
  messageId: string;
  finalContent: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TurnErrorEvent {
  type: "error";
  code: string;
  message: string;
  fatal: boolean;
}

export type TurnEvent =
  | TokenDeltaEvent
  | ToolCallStartEvent
  | ToolCallResultEvent
  | GenUIComponentEvent
  | ProvenanceNoticeEvent
  | TurnCompleteEvent
  | TurnErrorEvent;

/**
 * Execution input for a turn in the harness.
 */
export interface ExecuteTurnInput {
  threadId: string;
  userId?: string;
  userMessage: string;
  targetAgentId?: string;
  signal?: AbortSignal;
  onEvent?: (event: TurnEvent) => void | Promise<void>;
  metadata?: Record<string, unknown>;
}
