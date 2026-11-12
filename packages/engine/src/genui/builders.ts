import { randomUUID } from "node:crypto";
import {
  A2UIApproval,
  A2UICard,
  A2UIChart,
  A2UIComponent,
  A2UIComponentSchema,
  A2UIForm,
  A2UIMetric,
  A2UITable,
} from "./types.js";

/**
 * Fluent builder factory for creating validated A2UI Generative UI components.
 */
export const A2UI = {
  card(props: Omit<A2UICard, "id" | "type"> & { id?: string }): A2UICard {
    const component: A2UICard = {
      id: props.id || randomUUID(),
      type: "card",
      ...props,
    };
    return A2UIComponentSchema.parse(component) as A2UICard;
  },

  table(props: Omit<A2UITable, "id" | "type"> & { id?: string }): A2UITable {
    const component: A2UITable = {
      id: props.id || randomUUID(),
      type: "table",
      ...props,
    };
    return A2UIComponentSchema.parse(component) as A2UITable;
  },

  metric(props: Omit<A2UIMetric, "id" | "type"> & { id?: string }): A2UIMetric {
    const component: A2UIMetric = {
      id: props.id || randomUUID(),
      type: "metric",
      ...props,
    };
    return A2UIComponentSchema.parse(component) as A2UIMetric;
  },

  chart(props: Omit<A2UIChart, "id" | "type"> & { id?: string }): A2UIChart {
    const component: A2UIChart = {
      id: props.id || randomUUID(),
      type: "chart",
      ...props,
    };
    return A2UIComponentSchema.parse(component) as A2UIChart;
  },

  form(props: Omit<A2UIForm, "id" | "type"> & { id?: string }): A2UIForm {
    const component: A2UIForm = {
      id: props.id || randomUUID(),
      type: "form",
      ...props,
    };
    return A2UIComponentSchema.parse(component) as A2UIForm;
  },

  approval(
    props: Omit<A2UIApproval, "id" | "type"> & { id?: string }
  ): A2UIApproval {
    const component: A2UIApproval = {
      id: props.id || randomUUID(),
      type: "approval",
      ...props,
    };
    return A2UIComponentSchema.parse(component) as A2UIApproval;
  },

  validate(component: unknown): A2UIComponent {
    return A2UIComponentSchema.parse(component);
  },
};
