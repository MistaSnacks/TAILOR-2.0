// convex/quality/loop.test.ts
import { describe, it, expect } from "vitest";
import { nextLoopState } from "./loop";
import type { CoveragePlanItem } from "../llm/types";

const gap = (requirement: string): CoveragePlanItem => ({ requirement, supportable: true, expectedMarkers: [requirement.toLowerCase()] });

describe("nextLoopState", () => {
  it("converged when there are no gaps (even at the round cap)", () => {
    expect(nextLoopState({ gaps: [], prevGapCount: 5, round: 3, maxRounds: 3 })).toEqual({ kind: "converged" });
  });

  it("exhausted when rounds already hit the cap and gaps remain", () => {
    expect(nextLoopState({ gaps: [gap("a")], prevGapCount: 99, round: 3, maxRounds: 3 })).toEqual({ kind: "exhausted" });
  });

  it("stalled when this round did not reduce the gap count", () => {
    expect(nextLoopState({ gaps: [gap("a"), gap("b")], prevGapCount: 2, round: 1, maxRounds: 3 })).toEqual({ kind: "stalled" });
  });

  it("continues with target requirement strings when gaps shrank and rounds remain", () => {
    const d = nextLoopState({ gaps: [gap("a")], prevGapCount: 3, round: 1, maxRounds: 3 });
    expect(d).toEqual({ kind: "continue", targets: ["a"] });
  });

  it("first round (prevGapCount = Infinity) continues", () => {
    const d = nextLoopState({ gaps: [gap("a"), gap("b")], prevGapCount: Number.POSITIVE_INFINITY, round: 0, maxRounds: 3 });
    expect(d).toEqual({ kind: "continue", targets: ["a", "b"] });
  });
});
