import { randomUUID } from "node:crypto";
import {
  AgentDefinition,
  ChatMessage,
  ExecuteTurnInput,
  SkillDefinition,
  ToolCall,
  ToolDefinition,
  TurnEvent,
} from "../core/types.js";
import { A2UIComponentSchema } from "../genui/types.js";
import {
  InMemoryMemoryProvider,
  MemoryProvider,
  packEssentialMemories,
  sanitizeAndCompactHistory,
} from "../memory/index.js";
import { LLMProvider } from "../providers/types.js";
import {
  markUntrusted,
  PROVENANCE_GUIDANCE,
} from "../rules/index.js";
import { routeMessage } from "../router/index.js";
import {
  RemoteHttpMcpClient,
  ToolRegistry,
  narrowTools,
} from "../tools/index.js";

export interface GrokHarnessOptions {
  model: LLMProvider;
  memory?: MemoryProvider;
  agents?: AgentDefinition[];
  defaultAgentId?: string;
  tools?: (ToolDefinition | SkillDefinition | RemoteHttpMcpClient)[];
  enableProvenanceGuidance?: boolean;
  enableUntrustedEnveloping?: boolean;
  maxHistoryTurns?: number;
  maxToolIterations?: number;
  stallTimeoutMs?: number;
}

export class GrokHarness {
  readonly model: LLMProvider;
  readonly memory: MemoryProvider;
  private agents: AgentDefinition[] = [];
  private defaultAgentId: string;
  private registry = new ToolRegistry();
  private enableProvenanceGuidance: boolean;
  private enableUntrustedEnveloping: boolean;
  private maxHistoryTurns: number;
  private maxToolIterations: number;
  private stallTimeoutMs: number;

  constructor(options: GrokHarnessOptions) {
    this.model = options.model;
    this.memory = options.memory || new InMemoryMemoryProvider();
    this.enableProvenanceGuidance = options.enableProvenanceGuidance ?? true;
    this.enableUntrustedEnveloping = options.enableUntrustedEnveloping ?? true;
    this.maxHistoryTurns = options.maxHistoryTurns || 20;
    this.maxToolIterations = options.maxToolIterations || 10;
    this.stallTimeoutMs = options.stallTimeoutMs || 60000;

    if (options.agents && options.agents.length > 0) {
      this.agents = [...options.agents];
      this.defaultAgentId = options.defaultAgentId || options.agents[0].id;
    } else {
      const defaultAgent: AgentDefinition = {
        id: "default_agent",
        name: "Grokbot Assistant",
        roleDescription: "General purpose AI assistant and automation agent",
        systemPrompt: "You are Grokbot, a powerful, accurate, and helpful cloud AI assistant.",
      };
      this.agents = [defaultAgent];
      this.defaultAgentId = defaultAgent.id;
    }

    if (options.tools) {
      for (const item of options.tools) {
        if ("slug" in item && "tools" in item) {
          this.registry.registerSkill(item as SkillDefinition);
        } else if ("name" in item && "execute" in item) {
          this.registry.registerTool(item as ToolDefinition);
        }
      }
    }
  }

  /**
   * Register a new tool dynamically into the running harness.
   */
  registerTool(tool: ToolDefinition): void {
    this.registry.registerTool(tool);
  }

  /**
   * Register a skill bundle into the harness.
   */
  registerSkill(skill: SkillDefinition): void {
    this.registry.registerSkill(skill);
  }

  /**
   * Connect a remote HTTP/SSE streamable MCP server.
   */
  async connectMcp(mcpClient: RemoteHttpMcpClient): Promise<ToolDefinition[]> {
    const loadedTools = await mcpClient.loadTools();
    this.registry.registerTools(loadedTools);
    return loadedTools;
  }

  /**
   * Execute an agent turn end-to-end with streaming events.
   */
  async executeTurn(input: ExecuteTurnInput): Promise<{
    agentId: string;
    finalContent: string;
    messageId: string;
  }> {
    const threadId = input.threadId;
    const userId = input.userId;
    const messageId = randomUUID();

    // 1. Agent Selection & Routing
    let targetAgent: AgentDefinition;
    if (input.targetAgentId) {
      targetAgent =
        this.agents.find((a) => a.id === input.targetAgentId) || this.agents[0];
    } else {
      const routingDecision = await routeMessage(
        input.userMessage,
        this.agents,
        this.defaultAgentId
      );
      targetAgent =
        this.agents.find((a) => a.id === routingDecision.agentId) ||
        this.agents[0];
    }

    // 2. Hydrate Context & Memory
    const rawHistory = await this.memory.getConversationHistory(
      threadId,
      this.maxHistoryTurns
    );

    const essentialMemories = await this.memory.getEssentialMemories({
      userId,
      agentId: targetAgent.id,
    });
    const packedEssential = packEssentialMemories(essentialMemories);

    const searchableMemories = await this.memory.searchMemories({
      query: input.userMessage,
      userId,
      agentId: targetAgent.id,
      limit: 3,
    });

    // 3. Assemble Grounded System Prompt
    const systemPromptBlocks: string[] = [targetAgent.systemPrompt];

    if (this.enableProvenanceGuidance) {
      systemPromptBlocks.push(PROVENANCE_GUIDANCE);
    }

    if (packedEssential.length > 0) {
      systemPromptBlocks.push(
        "CORE USER RULES & ESSENTIAL FACTS (Always Adhere):\n" +
          packedEssential.map((m) => `- ${m.text}`).join("\n")
      );
    }

    if (searchableMemories.length > 0) {
      systemPromptBlocks.push(
        "RELEVANT HISTORICAL CONTEXT:\n" +
          searchableMemories.map((m) => `- ${m.text}`).join("\n")
      );
    }

    const systemInstruction = systemPromptBlocks.join("\n\n");

    // 4. Compact and Sanitize History
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: input.userMessage,
      timestamp: new Date().toISOString(),
    };

    const activeMessages = sanitizeAndCompactHistory(
      [...rawHistory, userMessage],
      this.maxHistoryTurns
    );

    // 5. Dynamic Tool Narrowing
    const allTools = this.registry.getAllTools();
    const allSkills = this.registry.getAllSkills();
    const narrowing = await narrowTools(allTools, allSkills, input.userMessage);
    const offeredTools = narrowing.offeredTools;

    // 6. Turn Execution Loop
    let iterations = 0;
    let finalAssistantText = "";

    while (iterations < this.maxToolIterations) {
      iterations++;

      const stream = this.model.generateStream({
        messages: activeMessages,
        systemInstruction,
        tools: offeredTools.length > 0 ? offeredTools : undefined,
        signal: input.signal,
      });

      let iterationText = "";
      let iterationToolCalls: ToolCall[] = [];

      for await (const chunk of stream) {
        if (chunk.deltaText) {
          iterationText += chunk.deltaText;
          if (input.onEvent) {
            await input.onEvent({
              type: "token_delta",
              text: chunk.deltaText,
            });
          }
        }

        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          iterationToolCalls.push(...chunk.toolCalls);
        }
      }

      finalAssistantText = iterationText;

      // If no tool calls were requested, assistant turn completed
      if (iterationToolCalls.length === 0) {
        break;
      }

      // Add assistant message with tool calls to active turns
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: iterationText,
        toolCalls: iterationToolCalls,
        timestamp: new Date().toISOString(),
      };
      activeMessages.push(assistantMessage);

      // Execute each tool call
      for (const tc of iterationToolCalls) {
        if (input.onEvent) {
          await input.onEvent({
            type: "tool_call_start",
            toolCallId: tc.id,
            toolName: tc.name,
            args:
              typeof tc.arguments === "string"
                ? JSON.parse(tc.arguments || "{}")
                : tc.arguments,
          });
        }

        const toolDef = this.registry.getTool(tc.name);
        let toolOutput: unknown;
        let isError = false;

        if (!toolDef) {
          toolOutput = `Error: Tool "${tc.name}" is not registered in this harness.`;
          isError = true;
        } else {
          try {
            const parsedArgs =
              typeof tc.arguments === "string"
                ? JSON.parse(tc.arguments || "{}")
                : tc.arguments;

            toolOutput = await toolDef.execute(parsedArgs, {
              threadId,
              userId,
              signal: input.signal,
            });

            // Check if output is a GenUI component
            const genUiCheck = A2UIComponentSchema.safeParse(toolOutput);
            if (genUiCheck.success && input.onEvent) {
              await input.onEvent({
                type: "genui_component",
                componentId: genUiCheck.data.id,
                component: genUiCheck.data,
              });
            }
          } catch (err: any) {
            toolOutput = `Tool execution error: ${err.message || String(err)}`;
            isError = true;
          }
        }

        // Format tool output text
        let outputString =
          typeof toolOutput === "string"
            ? toolOutput
            : JSON.stringify(toolOutput);

        // Envelop outside data to defeat prompt injection
        if (this.enableUntrustedEnveloping && !isError) {
          outputString = markUntrusted(outputString, tc.name);
        }

        if (input.onEvent) {
          await input.onEvent({
            type: "tool_call_result",
            toolCallId: tc.id,
            toolName: tc.name,
            result: toolOutput,
            isError,
          });
        }

        activeMessages.push({
          role: "tool",
          name: tc.name,
          toolCallId: tc.id,
          content: outputString,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 7. Persist to Cloud Database (Supabase)
    await this.memory.saveMessage(threadId, userMessage);
    await this.memory.saveMessage(threadId, {
      id: messageId,
      role: "assistant",
      content: finalAssistantText,
      name: targetAgent.name,
      timestamp: new Date().toISOString(),
    });

    if (input.onEvent) {
      await input.onEvent({
        type: "turn_complete",
        messageId,
        finalContent: finalAssistantText,
      });
    }

    return {
      agentId: targetAgent.id,
      finalContent: finalAssistantText,
      messageId,
    };
  }
}
