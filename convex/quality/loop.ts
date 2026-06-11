// convex/quality/loop.ts
// Pure fixed-point decision + dependency-injected loop orchestrator for §16.
// No Convex/SDK imports: LLM roles are passed in as interfaces, so this unit-tests
// with scripted stubs. See docs/specs/2026-06-11-coverage-loop-design.md.
import type { CoveragePlanItem } from "../llm/types";

export type LoopDecision =
  | { kind: "converged" }
  | { kind: "stalled" }
  | { kind: "exhausted" }
  | { kind: "continue"; targets: string[] };

/** Decide whether to run another revise round. Order: converged → exhausted → stalled → continue. */
export function nextLoopState(args: {
  gaps: CoveragePlanItem[];
  prevGapCount: number;
  round: number;
  maxRounds: number;
}): LoopDecision {
  const { gaps, prevGapCount, round, maxRounds } = args;
  if (gaps.length === 0) return { kind: "converged" };
  if (round >= maxRounds) return { kind: "exhausted" };
  if (gaps.length >= prevGapCount) return { kind: "stalled" }; // no progress vs last round
  return { kind: "continue", targets: gaps.map((g) => g.requirement) };
}
