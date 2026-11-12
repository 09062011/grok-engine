import { describe, it, expect, vi } from "vitest";
import {
  ToolRegistry,
  narrowTools,
  SELECTION_FLOOR,
  RemoteHttpMcpClient,
} from "../src/tools/index.js";
import { ToolDefinition, SkillDefinition } from "../src/core/types.js";
import { isMarkedUntrusted } from "../src/rules/index.js";

function makeTool(name: string): ToolDefinition {
  return {
    name,
    description: `Description for ${name}`,
    parameters: { type: "object" },
    execute: async () => `Executed ${name}`,
  };
}

describe("Tools, Skills & Dynamic Narrowing", () => {
  it("registers and retrieves tools dynamically", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("web_search");
    registry.registerTool(tool);

    expect(registry.getTool("web_search")).toBe(tool);
    expect(registry.getAllTools().length).toBe(1);

    registry.unregisterTool("web_search");
    expect(registry.getTool("web_search")).toBeUndefined();
  });

  it("passes all tools directly when count <= SELECTION_FLOOR", async () => {
    const tools = Array.from({ length: 8 }, (_, i) => makeTool(`tool_${i}`));
    const skills: SkillDefinition[] = [];

    const result = await narrowTools(tools, skills, "Query database");
    expect(result.reason).toBe("under-floor");
    expect(result.offeredTools.length).toBe(8);
  });

  it("narrows tools using skill classifier when tool count > SELECTION_FLOOR", async () => {
    const tools: ToolDefinition[] = [];
    const skillA: SkillDefinition = {
      slug: "database",
      title: "Database Querying",
      summary: "SQL and table tools",
      tools: [makeTool("sql_query"), makeTool("list_tables")],
    };
    const skillB: SkillDefinition = {
      slug: "github",
      title: "GitHub Tools",
      summary: "PR and issue management",
      tools: [makeTool("create_pr"), makeTool("list_issues")],
    };

    tools.push(...skillA.tools, ...skillB.tools);
    // Add extra tools to exceed SELECTION_FLOOR (12)
    for (let i = 0; i < 10; i++) {
      tools.push(makeTool(`misc_${i}`));
    }
    expect(tools.length).toBe(14); // > 12

    const mockClassifier = vi.fn().mockResolvedValue(["database"]);

    const result = await narrowTools(
      tools,
      [skillA, skillB],
      "Run SELECT * FROM users",
      mockClassifier
    );

    expect(result.reason).toBe("selected");
    expect(result.selectedSkills).toEqual(["database"]);
    // Offered tools should include database tools + ungrouped misc tools
    const offeredNames = result.offeredTools.map((t) => t.name);
    expect(offeredNames).toContain("sql_query");
    expect(offeredNames).toContain("list_tables");
    expect(offeredNames).not.toContain("create_pr");
    expect(offeredNames).not.toContain("list_issues");
  });

  it("fails open to all tools if classifier fails or returns empty", async () => {
    const tools = Array.from({ length: 15 }, (_, i) => makeTool(`tool_${i}`));
    const skills: SkillDefinition[] = [
      {
        slug: "s1",
        title: "S1",
        summary: "S1 tools",
        tools: tools.slice(0, 5),
      },
    ];

    const mockClassifier = vi.fn().mockRejectedValue(new Error("Timeout"));

    const result = await narrowTools(
      tools,
      skills,
      "What is the weather?",
      mockClassifier
    );
    expect(result.reason).toBe("fallback-offer-all");
    expect(result.offeredTools.length).toBe(15);
  });

  it("RemoteHttpMcpClient loads tools and executes with untrusted envelope", async () => {
    const fakeFetch = vi.fn().mockImplementation((url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === "tools/list") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            result: {
              tools: [
                {
                  name: "search_docs",
                  description: "Search corporate documentation",
                  inputSchema: { type: "object" },
                },
              ],
            },
          }),
        });
      }
      if (body.method === "tools/call") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            result: {
              content: [{ type: "text", text: "Found documentation section 4.1" }],
            },
          }),
        });
      }
      return Promise.reject(new Error("Unknown method"));
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch as any;

    const mcp = new RemoteHttpMcpClient({
      name: "docs_mcp",
      endpointUrl: "https://remote.mcp.test/api",
    });

    const tools = await mcp.loadTools();
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe("docs_mcp_search_docs");

    const execOutput = await tools[0].execute({}, { threadId: "t1" });
    expect(typeof execOutput).toBe("string");
    expect(isMarkedUntrusted(execOutput as string)).toBe(true);
    expect(execOutput).toContain("Found documentation section 4.1");

    globalThis.fetch = originalFetch;
  });
});
