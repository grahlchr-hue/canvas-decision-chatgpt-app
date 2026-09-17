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

export function createDecisionServer(): McpServer {
  const server = new McpServer(
    { name: "decision-canvas", version: "1.0.0" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
  "CRITICAL ROUTING RULES:\n" +
  "1. ONLY trigger decision tools when the user is actively deciding between or comparing at least TWO concrete options.\n" +
  "2. NEVER trigger decision tools for standard text queries, greetings, translations, or factual lookups.\n" +
  "3. INTELLIGENT WEIGHT PROPOSALS (CORE VALUE):\n" +
  "   - NEVER assign identical weights to all criteria (e.g. do NOT set all to 5 or 8).\n" +
  "   - Analyze the user's prompt context to infer what matters most.\n" +
  "   - Differentiate weights clearly on a 1–10 scale: Core priorities get 8–10, secondary factors 5–7, trade-offs/minor factors 2–4.\n" +
  "4. LANGUAGE: Always use the exact same language as the user query (no auto-translation).\n" +
  "5. SCORING ORIENTATION: Frame criteria positively as benefits. 10 is best, 0/1 is worst.\n" +
  "6. FLOW: Call build_decision_analysis first, then immediately show_decision_canvas.",
    },
  );

  server.registerResource("decision-canvas-widget", TEMPLATE_URI, {}, async () => ({
    contents: [
      {
        uri: TEMPLATE_URI,
        mimeType: "text/html;profile=mcp-app",
        text: loadWidgetHtml(),
        _meta: {
          ui: {
            prefersBorder: true,
            domain: "https://canvas-decision-chatgpt-app.onrender.com",
            csp: {
              connectDomains: [],
              resourceDomains: [],
            },
          },
        },
      },
    ],
  }));

 server.registerTool(
  "build_decision_analysis",
  {
    title: "Build decision analysis",
    description:
      "Structures and scores a choice between multiple alternatives using explicit, differentiated weighted criteria.\n\n" +
      "WEIGHTING RULES:\n" +
      "- Propose an intelligent, contextual weighting for each criterion (1–10 scale).\n" +
      "- NEVER return equal weights for all criteria. Reflect the user's implicit and explicit urgency and goals.\n\n" +
      "WHEN TO USE:\n" +
      "- ONLY when comparing or deciding between at least TWO concrete options.\n\n" +
      "STRICT EXCLUSIONS (NEVER USE):\n" +
      "- Translations, single explanations, factual questions, or creative writing.",
    inputSchema: decisionInputSchema,
    // ...
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
        "Renders the interactive visual Decision Canvas widget.\n\n" +
        "WHEN TO USE:\n" +
        "- ONLY immediately after a successful build_decision_analysis execution, or when the user explicitly asks to view/interact with the decision canvas.\n\n" +
        "STRICT EXCLUSIONS (NEVER USE):\n" +
        "- NEVER call without an existing decision structure or before build_decision_analysis has produced data.\n" +
        "- NEVER trigger on general conversational prompts or non-decision tasks.",
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
