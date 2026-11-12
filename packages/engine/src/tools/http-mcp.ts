import { ToolDefinition } from "../core/types.js";
import { markUntrusted } from "../rules/index.js";

export interface RemoteHttpMcpOptions {
  name: string;
  endpointUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  envelopeOutput?: boolean;
}

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/**
 * Cloud-native Remote HTTP/SSE MCP Client.
 *
 * Connects to streamable remote Model Context Protocol (MCP) servers over HTTP/SSE.
 * Zero local stdio subprocesses or machine dependencies.
 */
export class RemoteHttpMcpClient {
  readonly name: string;
  private endpointUrl: string;
  private headers: Record<string, string>;
  private timeoutMs: number;
  private envelopeOutput: boolean;
  private requestId = 0;

  constructor(options: RemoteHttpMcpOptions) {
    this.name = options.name;
    this.endpointUrl = options.endpointUrl;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(options.headers || {}),
    };
    this.timeoutMs = options.timeoutMs || 30000;
    this.envelopeOutput = options.envelopeOutput ?? true;
  }

  /**
   * Send JSON-RPC 2.0 request to the remote MCP HTTP server.
   */
  private async jsonRpc(
    method: string,
    params: Record<string, unknown> = {},
    signal?: AbortSignal
  ): Promise<any> {
    const id = ++this.requestId;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const onCallerAbort = () => controller.abort();
    signal?.addEventListener("abort", onCallerAbort);

    try {
      const response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: this.headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Remote MCP [${this.name}] HTTP error ${response.status}: ${await response.text()}`
        );
      }

      const json = await response.json();
      if (json.error) {
        throw new Error(
          `Remote MCP [${this.name}] RPC error: ${json.error.message || JSON.stringify(json.error)}`
        );
      }

      return json.result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  /**
   * Fetch all declared tools from the remote MCP server and convert them into ToolDefinitions.
   */
  async loadTools(): Promise<ToolDefinition[]> {
    const result = await this.jsonRpc("tools/list", {});
    const mcpTools: McpToolSchema[] = result?.tools || [];

    return mcpTools.map((mcpTool) => {
      const toolName = `${this.name}_${mcpTool.name}`;
      const toolDef: ToolDefinition = {
        name: toolName,
        description: mcpTool.description || `Tool from ${this.name}`,
        parameters: mcpTool.inputSchema || { type: "object", properties: {} },
        execute: async (args, context) => {
          const callResult = await this.jsonRpc(
            "tools/call",
            {
              name: mcpTool.name,
              arguments: args,
            },
            context.signal
          );

          // Extract text content from MCP format
          let outputText = "";
          if (callResult?.content && Array.isArray(callResult.content)) {
            outputText = callResult.content
              .map((c: any) => (typeof c.text === "string" ? c.text : JSON.stringify(c)))
              .join("\n");
          } else {
            outputText = typeof callResult === "string" ? callResult : JSON.stringify(callResult);
          }

          if (this.envelopeOutput) {
            return markUntrusted(outputText, `${this.name}/${mcpTool.name}`);
          }
          return outputText;
        },
      };

      return toolDef;
    });
  }
}
