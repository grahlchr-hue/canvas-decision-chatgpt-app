import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { scoreDecision, type DecisionInput } from "./decision.js";

export const TEMPLATE_URI = "ui://decision-canvas/v1.html";

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

export function createDecisionServer(): McpServer {
  const server = new McpServer(
    { name: "decision-canvas", version: "1.0.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        "Use build_decision_analysis to structure and score a real choice. Use 2–5 concrete options and 2–6 independent criteria. Then call show_decision_canvas with the exact result so the user can inspect and tune it visually.",
    },
  );

  server.registerResource("decision-canvas-widget", TEMPLATE_URI, {}, async () => ({
    contents: [
      {
        uri: TEMPLATE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: loadWidgetHtml(),
        _meta: { ui: { prefersBorder: true } },
      },
    ],
  }));

  server.registerTool(
    "build_decision_analysis",
    {
      title: "Build decision analysis",
      description:
        "Structure and score a difficult choice. Use when the user is comparing options and would benefit from explicit weighted criteria. Give every option a 0–10 score for every criterion ID.",
      inputSchema: decisionInputSchema,
      outputSchema: decisionOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: {
        "openai/toolInvocation/invoking": "Scoring the tradeoffs…",
        "openai/toolInvocation/invoked": "Tradeoffs scored.",
      },
    },
    async (input) => {
      try {
        const canvas = scoreDecision(input as DecisionInput);
        return { structuredContent: canvas, content: [{ type: "text", text: summaryText(canvas) }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : "Unable to score decision." }],
        };
      }
    },
  );

  server.registerTool(
    "show_decision_canvas",
    {
      title: "Show decision canvas",
      description:
        "Render an interactive decision canvas. Always call build_decision_analysis first, then pass its exact structured result to this tool.",
      inputSchema: decisionOutputSchema,
      outputSchema: decisionOutputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      _meta: {
        ui: { resourceUri: TEMPLATE_URI },
        "openai/outputTemplate": TEMPLATE_URI,
        "openai/toolInvocation/invoking": "Opening the decision canvas…",
        "openai/toolInvocation/invoked": "Decision canvas ready.",
      },
    },
    async (canvas) => ({
      structuredContent: canvas,
      content: [{ type: "text", text: summaryText(canvas as ReturnType<typeof scoreDecision>) }],
    }),
  );

  return server;
}

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
