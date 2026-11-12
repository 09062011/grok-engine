import { AgentDefinition } from "../core/types.js";

export const MIN_CONFIDENCE = 0.6;

export type RoutingUndecided =
  | "unreachable"
  | "unparsed"
  | "off-roster"
  | "unconfident"
  | "one-candidate";

export interface RoutingDecision {
  agentId: string;
  name: string;
  confidence: number;
  reason: string;
  fallback: boolean;
  undecided: RoutingUndecided | null;
}

/**
 * Builds the LLM prompt for choosing which agent to route an untagged user message to.
 *
 * Includes both what the agent is for (`roleDescription`) AND the systems it can reach (`reaches`).
 */
export function buildRoutingPrompt(
  text: string,
  candidates: AgentDefinition[]
): string {
  const roster = candidates
    .map((c) => {
      const lines = [
        `- id: "${c.id}"`,
        `  name: "${c.name}"`,
        `  for: "${c.roleDescription}"`,
      ];
      if (c.reaches && c.reaches.length > 0) {
        lines.push(`  can reach: ${c.reaches.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  return `
You are an intelligent agent router. A user has sent a message that does not name a specific agent.
Pick the best agent from the roster below to handle the message.

Consider BOTH what the agent is for AND the systems it can reach.
If the message asks for an action in a specific external system, pick the agent that can actually reach that system.

Roster:
${roster}

User message:
"${text.replace(/"/g, '\\"')}"

Respond with ONLY a JSON object matching this schema:
{
  "agentId": "<id of chosen agent>",
  "confidence": <number between 0.0 and 1.0>,
  "reason": "<one concise sentence explaining why>"
}
`.trim();
}

/**
 * Evaluates candidate agents and routes the message to the best match.
 *
 * If confidence < 0.6 or model fails, gracefully falls back to default agent without throwing.
 */
export async function routeMessage(
  text: string,
  candidates: AgentDefinition[],
  defaultAgentId: string,
  modelCaller?: (prompt: string) => Promise<string>
): Promise<RoutingDecision> {
  const defaultAgent =
    candidates.find((c) => c.id === defaultAgentId) || candidates[0];

  if (!defaultAgent) {
    throw new Error("Cannot route message: candidates roster is empty.");
  }

  // If there is only one agent on the roster, nothing to decide
  if (candidates.length === 1) {
    return {
      agentId: defaultAgent.id,
      name: defaultAgent.name,
      confidence: 1.0,
      reason: "Single agent in deployment roster.",
      fallback: false,
      undecided: "one-candidate",
    };
  }

  // If no model caller provided, check simple keyword reachability heuristic
  if (!modelCaller) {
    const lower = text.toLowerCase();
    for (const candidate of candidates) {
      if (candidate.reaches) {
        for (const reach of candidate.reaches) {
          if (lower.includes(reach.toLowerCase())) {
            return {
              agentId: candidate.id,
              name: candidate.name,
              confidence: 0.8,
              reason: `Matched reachability keyword "${reach}".`,
              fallback: false,
              undecided: null,
            };
          }
        }
      }
    }

    return {
      agentId: defaultAgent.id,
      name: defaultAgent.name,
      confidence: 0.5,
      reason: "No model caller provided; defaulted.",
      fallback: true,
      undecided: "unconfident",
    };
  }

  try {
    const prompt = buildRoutingPrompt(text, candidates);
    const rawResponse = await modelCaller(prompt);

    // Clean JSON response markdown blocks if present
    const cleanJson = rawResponse
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      return {
        agentId: defaultAgent.id,
        name: defaultAgent.name,
        confidence: 0.0,
        reason: "Router response was not valid JSON.",
        fallback: true,
        undecided: "unparsed",
      };
    }

    const { agentId, confidence = 0, reason = "" } = parsed;
    const matched = candidates.find((c) => c.id === agentId);

    if (!matched) {
      return {
        agentId: defaultAgent.id,
        name: defaultAgent.name,
        confidence: 0.0,
        reason: `Model selected agent "${agentId}" which is not on the roster.`,
        fallback: true,
        undecided: "off-roster",
      };
    }

    const confScore = Number(confidence) || 0;
    const threshold = matched.confidenceThreshold ?? MIN_CONFIDENCE;

    if (confScore < threshold) {
      return {
        agentId: defaultAgent.id,
        name: defaultAgent.name,
        confidence: confScore,
        reason: `Match confidence ${confScore.toFixed(2)} was below threshold ${threshold}.`,
        fallback: true,
        undecided: "unconfident",
      };
    }

    return {
      agentId: matched.id,
      name: matched.name,
      confidence: confScore,
      reason: String(reason || "Matched by intent and reachability."),
      fallback: false,
      undecided: null,
    };
  } catch {
    return {
      agentId: defaultAgent.id,
      name: defaultAgent.name,
      confidence: 0.0,
      reason: "Routing model call failed or timed out.",
      fallback: true,
      undecided: "unreachable",
    };
  }
}
