import { z } from "zod";

/**
 * Standard A2UI component types.
 */
export type A2UIComponentType =
  | "card"
  | "table"
  | "metric"
  | "chart"
  | "form"
  | "approval";

export interface A2UIBaseComponent {
  id: string;
  type: A2UIComponentType;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface A2UICard extends A2UIBaseComponent {
  type: "card";
  subtitle?: string;
  content: string;
  badge?: {
    text: string;
    variant?: "default" | "success" | "warning" | "danger" | "info";
  };
  actions?: Array<{
    id: string;
    label: string;
    actionType: "post_message" | "invoke_tool" | "open_url";
    payload: string;
  }>;
}

export interface A2UITableColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
}

export interface A2UITable extends A2UIBaseComponent {
  type: "table";
  columns: A2UITableColumn[];
  rows: Array<Record<string, unknown>>;
  caption?: string;
}

export interface A2UIMetric extends A2UIBaseComponent {
  type: "metric";
  value: string | number;
  label: string;
  change?: string | number;
  trend?: "up" | "down" | "neutral";
  caption?: string;
}

export interface A2UIChartSeries {
  name: string;
  data: number[];
  color?: string;
}

export interface A2UIChart extends A2UIBaseComponent {
  type: "chart";
  chartType: "line" | "bar" | "pie" | "scatter";
  labels: string[];
  series: A2UIChartSeries[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface A2UIFormField {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "textarea";
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: string }>;
}

export interface A2UIForm extends A2UIBaseComponent {
  type: "form";
  formId: string;
  fields: A2UIFormField[];
  submitLabel?: string;
  actionEndpoint?: string;
}

export interface A2UIApproval extends A2UIBaseComponent {
  type: "approval";
  requestId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  severity: "info" | "warning" | "critical";
  message: string;
}

export type A2UIComponent =
  | A2UICard
  | A2UITable
  | A2UIMetric
  | A2UIChart
  | A2UIForm
  | A2UIApproval;

/**
 * Zod validation schema for an A2UI component.
 */
export const A2UIComponentSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("card"),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    content: z.string(),
    badge: z
      .object({
        text: z.string(),
        variant: z
          .enum(["default", "success", "warning", "danger", "info"])
          .optional(),
      })
      .optional(),
    actions: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          actionType: z.enum(["post_message", "invoke_tool", "open_url"]),
          payload: z.string(),
        })
      )
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("table"),
    title: z.string().optional(),
    columns: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        align: z.enum(["left", "center", "right"]).optional(),
      })
    ),
    rows: z.array(z.record(z.unknown())),
    caption: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("metric"),
    title: z.string().optional(),
    value: z.union([z.string(), z.number()]),
    label: z.string(),
    change: z.union([z.string(), z.number()]).optional(),
    trend: z.enum(["up", "down", "neutral"]).optional(),
    caption: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("chart"),
    title: z.string().optional(),
    chartType: z.enum(["line", "bar", "pie", "scatter"]),
    labels: z.array(z.string()),
    series: z.array(
      z.object({
        name: z.string(),
        data: z.array(z.number()),
        color: z.string().optional(),
      })
    ),
    xAxisLabel: z.string().optional(),
    yAxisLabel: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("form"),
    title: z.string().optional(),
    formId: z.string(),
    fields: z.array(
      z.object({
        name: z.string(),
        label: z.string(),
        type: z.enum(["text", "number", "select", "checkbox", "textarea"]),
        required: z.boolean().optional(),
        placeholder: z.string().optional(),
        defaultValue: z.unknown().optional(),
        options: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .optional(),
      })
    ),
    submitLabel: z.string().optional(),
    actionEndpoint: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  z.object({
    id: z.string(),
    type: z.literal("approval"),
    title: z.string().optional(),
    requestId: z.string(),
    toolName: z.string(),
    parameters: z.record(z.unknown()),
    severity: z.enum(["info", "warning", "critical"]),
    message: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
]);
