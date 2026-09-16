export type Criterion = {
  id: string;
  label: string;
  weight: number;
};

export type DecisionOption = {
  id: string;
  name: string;
  summary: string;
  scores: Record<string, number>;
};

export type DecisionInput = {
  title: string;
  context?: string;
  criteria: Criterion[];
  options: DecisionOption[];
};

export type ScoredOption = DecisionOption & {
  total: number;
  rank: number;
};

export type DecisionCanvas = Omit<DecisionInput, "options"> & {
  options: ScoredOption[];
  winnerId: string;
  weightTotal: number;
};

const round = (value: number) => Math.round(value * 10) / 10;

export function scoreDecision(input: DecisionInput): DecisionCanvas {
  const weightTotal = input.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (weightTotal <= 0) throw new Error("At least one criterion must have a positive weight.");

  const scored = input.options
    .map((option) => {
      const weighted = input.criteria.reduce((sum, criterion) => {
        const score = option.scores[criterion.id];
        if (score === undefined) {
          throw new Error(`Missing score for criterion '${criterion.id}' on option '${option.id}'.`);
        }
        return sum + score * criterion.weight;
      }, 0);
      return { ...option, total: round(weighted / weightTotal) };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .map((option, index) => ({ ...option, rank: index + 1 }));

  const winner = scored[0];
  if (!winner) throw new Error("At least one option is required.");

  return {
    ...input,
    options: scored,
    winnerId: winner.id,
    weightTotal,
  };
}
