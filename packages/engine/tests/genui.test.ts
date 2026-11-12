import { describe, it, expect } from "vitest";
import { A2UI } from "../src/genui/index.js";

describe("Generative UI (A2UI) Builder & Validation", () => {
  it("builds a valid interactive card component", () => {
    const card = A2UI.card({
      title: "Quarterly Summary",
      content: "All KPIs met.",
      badge: { text: "Verified", variant: "success" },
      actions: [
        {
          id: "act-1",
          label: "View Report",
          actionType: "post_message",
          payload: "Show full breakdown",
        },
      ],
    });

    expect(card.type).toBe("card");
    expect(card.id).toBeDefined();
    expect(card.badge?.variant).toBe("success");
    expect(card.actions?.length).toBe(1);
  });

  it("builds a valid table component with columns and rows", () => {
    const table = A2UI.table({
      title: "Recent Transactions",
      columns: [
        { key: "id", label: "Tx ID" },
        { key: "amount", label: "Amount", align: "right" },
      ],
      rows: [
        { id: "tx-1", amount: "$150.00" },
        { id: "tx-2", amount: "$3,200.50" },
      ],
    });

    expect(table.type).toBe("table");
    expect(table.columns.length).toBe(2);
    expect(table.rows.length).toBe(2);
  });

  it("builds a valid metric component", () => {
    const metric = A2UI.metric({
      label: "Active Subscriptions",
      value: 1420,
      change: "+12.4%",
      trend: "up",
    });

    expect(metric.type).toBe("metric");
    expect(metric.value).toBe(1420);
    expect(metric.trend).toBe("up");
  });

  it("builds a valid interactive form component", () => {
    const form = A2UI.form({
      title: "Support Ticket",
      formId: "ticket-create",
      fields: [
        { name: "subject", label: "Subject", type: "text", required: true },
        {
          name: "category",
          label: "Category",
          type: "select",
          options: [
            { label: "Billing", value: "billing" },
            { label: "Technical", value: "tech" },
          ],
        },
      ],
      submitLabel: "Create Ticket",
    });

    expect(form.type).toBe("form");
    expect(form.fields.length).toBe(2);
  });

  it("builds an approval modal for sensitive human-in-the-loop actions", () => {
    const approval = A2UI.approval({
      requestId: "req-99",
      toolName: "database_drop_table",
      parameters: { tableName: "archive_logs" },
      severity: "critical",
      message: "Are you sure you want to drop archive_logs? This cannot be undone.",
    });

    expect(approval.type).toBe("approval");
    expect(approval.severity).toBe("critical");
  });

  it("fails validation when invalid component schema is provided", () => {
    expect(() => {
      // @ts-expect-error Testing invalid schema
      A2UI.validate({ type: "invalid_type", id: "123" });
    }).toThrow();
  });
});
