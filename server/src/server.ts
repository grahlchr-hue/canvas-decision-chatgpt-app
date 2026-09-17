import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scoreDecision, type DecisionInput } from "./decision.js";

export const TEMPLATE_URI = "ui://decision-canvas/v2.html";

const criterionSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/),
  label: z.string().min(1).max(60),
  weight: z.number().min(0).max(10),
});

const optionSchema = z.object({
  id: z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1).max(80),
  summary: z.string().max(240),
  scores: z.record(z.number().min(0).max(10)),
});

const decisionInputSchema = {
  title: z.string().min(3).max(120),
  context: z.string().max(600).optional(),
  criteria: z.array(criterionSchema).min(2).max(6),
  options: z.array(optionSchema).min(2).max(5),
};

const scoredOptionSchema = optionSchema.extend({
  total: z.number(),
  rank: z.number().int().positive(),
});

const decisionOutputSchema = {
  title: z.string(),
  context: z.string().optional(),
  criteria: z.array(criterionSchema),
  options: z.array(scoredOptionSchema),
  winnerId: z.string(),
  weightTotal: z.number(),
};

export function loadWidgetHtml(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../../web/dist/component.js"),
    resolve(here, "../../web/dist/component.js"),
  ];
  const componentPath = candidates.find((path) => {
    try {
      readFileSync(path);
      return true;
    } catch {
      return false;
    }
  });
  if (!componentPath) throw new Error("Widget bundle not found. Run npm run build:widget first.");
  const component = readFileSync(componentPath, "utf8");
  return `<div id="root"></div><script type="module">${component}</script>`;
}

function summaryText(canvas: ReturnType<typeof scoreDecision>): string {
  const ranking = canvas.options.map((option) => `${option.rank}. ${option.name} (${option.total}/10)`).join("; ");
  return `Decision canvas scored for “${canvas.title}”. Ranking: ${ranking}. Scores are weighted from 0–10 and should inform, not replace, the user's judgment.`;
}

createDecisionServer()

export const demoDecision: DecisionInput = {
  title: "Choose a home-office setup",
  context: "Balance comfort, cost, and flexibility for a small apartment.",
  criteria: [
    { id: "comfort", label: "Comfort", weight: 8 },
    { id: "cost", label: "Low cost", weight: 6 },
    { id: "space", label: "Space efficiency", weight: 7 },
  ],
  options: [
    { id: "desk", name: "Standing desk", summary: "Ergonomic and adjustable, but takes space.", scores: { comfort: 9, cost: 5, space: 5 } },
    { id: "wall", name: "Wall-mounted desk", summary: "Compact and tidy with limited adjustability.", scores: { comfort: 6, cost: 7, space: 10 } },
    { id: "table", name: "Existing table", summary: "No new purchase, with basic ergonomics.", scores: { comfort: 5, cost: 10, space: 7 } },
  ],
};
