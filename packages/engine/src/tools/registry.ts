import { ToolDefinition, SkillDefinition } from "../core/types.js";

/**
 * Modular registry for tools and skill bundles.
 *
 * Nothing is preloaded; tools and remote MCP connectors are registered dynamically.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private skills = new Map<string, SkillDefinition>();

  /**
   * Register an individual tool.
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register multiple tools.
   */
  registerTools(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Register a skill bundle grouping related tools.
   */
  registerSkill(skill: SkillDefinition): void {
    this.skills.set(skill.slug, skill);
    for (const tool of skill.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Remove a tool by name.
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Remove a skill bundle.
   */
  unregisterSkill(slug: string): boolean {
    return this.skills.delete(slug);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getAllSkills(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  clear(): void {
    this.tools.clear();
    this.skills.clear();
  }
}
