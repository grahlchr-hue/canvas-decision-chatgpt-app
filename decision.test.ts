import assert from "node:assert/strict";
import test from "node:test";
import { scoreDecision } from "../src/decision.js";

test("scores and ranks options using normalized weights", () => {
  const result = scoreDecision({
    title: "Pick one",
    criteria: [{ id: "quality", label: "Quality", weight: 3 }, { id: "cost", label: "Cost", weight: 1 }],
    options: [
      { id: "a", name: "A", summary: "", scores: { quality: 10, cost: 2 } },
      { id: "b", name: "B", summary: "", scores: { quality: 6, cost: 10 } },
    ],
  });
  assert.equal(result.options[0]?.id, "a");
  assert.equal(result.options[0]?.total, 8);
  assert.equal(result.options[1]?.total, 7);
});

test("rejects missing option scores", () => {
  assert.throws(() => scoreDecision({
    title: "Pick one",
    criteria: [{ id: "quality", label: "Quality", weight: 1 }],
    options: [{ id: "a", name: "A", summary: "", scores: {} }],
  }), /Missing score/);
});
