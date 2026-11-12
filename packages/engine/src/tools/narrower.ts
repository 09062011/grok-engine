import { ToolDefinition, SkillDefinition } from "../core/types.js";

/**
 * Below this count, modern LLMs reliably pick the right tool unaided,
 * so skipping the selection pass saves a round-trip on every turn.
 * Above this count, offering all tools degrades tool-calling accuracy.
 */
export const SELECTION_FLOOR = 12;

export interface ToolNarrowingResult {
  offeredTools: ToolDefinition[];
  selectedSkills: string[];
  reason:
    | "under-floor"
    | "no-skills-declared"
    | "selected"
    | "fallback-offer-all";
}

/**
 * Narrows down offered tools if tool catalog exceeds SELECTION_FLOOR.
 *
 * Implements a fail-open design: if skill classification fails or is ambiguous,
 * it returns all available tools rather than locking out capabilities.
 */
export async function narrowTools(
  tools: ToolDefinition[],
  skills: SkillDefinition[],
  userMessage: string,
  classifier?: (
    message: string,
    skillSummaries: Array<{ slug: string; title: string; summary: string }>
  ) => Promise<string[]>
): Promise<ToolNarrowingResult> {
  // 1. Under floor: pass everything directly
  if (tools.length <= SELECTION_FLOOR) {
    return {
      offeredTools: tools,
      selectedSkills: [],
      reason: "under-floor",
    };
  }

  // 2. If no skills are defined to group tools, we cannot narrow
  if (skills.length === 0 || !classifier) {
    return {
      offeredTools: tools,
      selectedSkills: [],
      reason: "no-skills-declared",
    };
  }

  try {
    const skillList = skills.map((s) => ({
      slug: s.slug,
      title: s.title,
      summary: s.summary,
    }));

    const chosenSlugs = await classifier(userMessage, skillList);

    if (!chosenSlugs || chosenSlugs.length === 0) {
      // Fail-open: offer all tools
      return {
        offeredTools: tools,
        selectedSkills: [],
        reason: "fallback-offer-all",
      };
    }

    const selectedToolNames = new Set<string>();
    for (const slug of chosenSlugs) {
      const skill = skills.find((s) => s.slug === slug);
      if (skill) {
        for (const t of skill.tools) {
          selectedToolNames.add(t.name);
        }
      }
    }

    // Include selected tools plus any ungrouped core tools
    const skillClaimedNames = new Set(
      skills.flatMap((s) => s.tools.map((t) => t.name))
    );
    const offered = tools.filter(
      (t) => selectedToolNames.has(t.name) || !skillClaimedNames.has(t.name)
    );

    return {
      offeredTools: offered.length > 0 ? offered : tools,
      selectedSkills: chosenSlugs,
      reason: "selected",
    };
  } catch {
    // Fail-open on classification error
    return {
      offeredTools: tools,
      selectedSkills: [],
      reason: "fallback-offer-all",
    };
  }
}
