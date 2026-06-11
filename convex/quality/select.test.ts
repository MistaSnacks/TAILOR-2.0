// convex/quality/select.test.ts
import { describe, it, expect } from "vitest";
import { BUDGET, fitsWithinBudget, totalBullets } from "./select";
import type { GeneratedResume, CoveragePlanItem } from "../llm/types";

const gap: CoveragePlanItem = { requirement: "X", supportable: true, expectedMarkers: ["x"] };

const draftWith = (bulletsPerRole: number[]): GeneratedResume => ({
  summary: "",
  experiences: bulletsPerRole.map((n, i) => ({
    company: `Co${i}`,
    position: "Role",
    highlights: Array.from({ length: n }, (_, j) => ({ text: `bullet ${j}`, type: "rephrase" })),
  })),
  skills: [],
  requirements: [],
  keywords: [],
});

describe("totalBullets", () => {
  it("sums highlights across roles", () => {
    expect(totalBullets(draftWith([3, 2, 1]))).toBe(6);
  });
});

describe("fitsWithinBudget", () => {
  it("fits when the draft is under the total bullet cap", () => {
    expect(fitsWithinBudget(draftWith([4, 3]), gap)).toBe(true); // 7 < 18
  });

  it("does not fit when the draft is at the total bullet cap", () => {
    const atCap = draftWith([6, 6, 6]); // 18 total
    expect(totalBullets(atCap)).toBe(BUDGET.maxBullets);
    expect(fitsWithinBudget(atCap, gap)).toBe(false);
  });
});
