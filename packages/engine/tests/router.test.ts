import { describe, it, expect, vi } from "vitest";
import { routeMessage, MIN_CONFIDENCE } from "../src/router/index.js";
import { AgentDefinition } from "../src/core/types.js";

const candidates: AgentDefinition[] = [
  {
    id: "general_bot",
    name: "General Assistant",
    roleDescription: "General knowledge and everyday questions",
    systemPrompt: "You are a helpful general assistant.",
  },
  {
    id: "jira_bot",
    name: "Jira Manager",
    roleDescription: "Manages Jira tickets, sprint planning, and backlog",
    reaches: ["Jira", "Atlassian"],
    systemPrompt: "You manage Jira issues.",
  },
  {
    id: "github_bot",
    name: "GitHub Reviewer",
    roleDescription: "Reviews PRs, creates git issues, and checks CI builds",
    reaches: ["GitHub", "Git"],
    systemPrompt: "You review code.",
  },
];

describe("Agent Router & Reachability Classifier", () => {
  it("routes automatically to single agent on 1-agent roster", async () => {
    const single = [candidates[0]];
    const decision = await routeMessage("Any message", single, single[0].id);

    expect(decision.agentId).toBe("general_bot");
    expect(decision.undecided).toBe("one-candidate");
    expect(decision.fallback).toBe(false);
  });

  it("routes correctly based on model selection and confidence", async () => {
    const mockModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        agentId: "jira_bot",
        confidence: 0.92,
        reason: "Message asks to create a sprint ticket in Jira.",
      })
    );

    const decision = await routeMessage(
      "Please file a Jira issue for the login bug",
      candidates,
      "general_bot",
      mockModel
    );

    expect(decision.agentId).toBe("jira_bot");
    expect(decision.confidence).toBe(0.92);
    expect(decision.fallback).toBe(false);
    expect(decision.undecided).toBeNull();
  });

  it("falls back to default agent when confidence < 0.6", async () => {
    const mockModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        agentId: "github_bot",
        confidence: 0.45,
        reason: "Maybe code related?",
      })
    );

    const decision = await routeMessage(
      "Can you help me check something?",
      candidates,
      "general_bot",
      mockModel
    );

    expect(decision.agentId).toBe("general_bot");
    expect(decision.fallback).toBe(true);
    expect(decision.undecided).toBe("unconfident");
  });

  it("handles malformed JSON response safely with unparsed status", async () => {
    const mockModel = vi.fn().mockResolvedValue("I think github_bot is best.");

    const decision = await routeMessage(
      "Check PR 123",
      candidates,
      "general_bot",
      mockModel
    );

    expect(decision.agentId).toBe("general_bot");
    expect(decision.fallback).toBe(true);
    expect(decision.undecided).toBe("unparsed");
  });

  it("handles off-roster agent selection safely", async () => {
    const mockModel = vi.fn().mockResolvedValue(
      JSON.stringify({
        agentId: "non_existent_bot",
        confidence: 0.99,
        reason: "Best fit",
      })
    );

    const decision = await routeMessage(
      "Hello",
      candidates,
      "general_bot",
      mockModel
    );

    expect(decision.agentId).toBe("general_bot");
    expect(decision.fallback).toBe(true);
    expect(decision.undecided).toBe("off-roster");
  });

  it("handles network/timeout errors with unreachable status", async () => {
    const mockModel = vi.fn().mockRejectedValue(new Error("504 Gateway Timeout"));

    const decision = await routeMessage(
      "Hello",
      candidates,
      "general_bot",
      mockModel
    );

    expect(decision.agentId).toBe("general_bot");
    expect(decision.fallback).toBe(true);
    expect(decision.undecided).toBe("unreachable");
  });
});
