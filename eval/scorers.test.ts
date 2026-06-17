import { describe, it, expect } from "vitest";
import { coverageHitRate, jdEcho } from "./scorers";
import type { CoverageMap } from "../convex/llm/types";

describe("coverageHitRate", () => {
  it("counts a supportable item covered only when its atsTerm appears", () => {
    const map: CoverageMap = [
      { requirement: "Analytical", supportable: true, atsTerms: ["analytical"], expectedMarkers: ["data analysis"] },
      { requirement: "SQL", supportable: true, atsTerms: ["sql"], expectedMarkers: [] },
    ];
    expect(coverageHitRate(map, "applied analytical judgment to fraud cases")).toBe(0.5);
  });
  it("a paraphrase alone does not count (atsTerm required)", () => {
    const map: CoverageMap = [
      { requirement: "Analytical", supportable: true, atsTerms: ["analytical"], expectedMarkers: ["data analysis"] },
    ];
    expect(coverageHitRate(map, "led data analysis of fraud trends")).toBe(0);
  });
  it("returns 1 when there are no supportable requirements", () => {
    const map: CoverageMap = [
      { requirement: "PhD", supportable: false, atsTerms: ["phd"], expectedMarkers: [] },
    ];
    expect(coverageHitRate(map, "anything")).toBe(1);
  });
});

describe("jdEcho", () => {
  const jd = "Excellent written and verbal communication skills with the ability to clearly articulate investigative findings and recommendations.";
  it("flags a bullet that pastes a 5-gram from the JD", () => {
    const r = jdEcho(["Prepared case files, utilizing written and verbal communication skills with the ability to clearly articulate findings"], jd);
    expect(r.jdEchoRate).toBe(1);
    expect(r.longestEcho).toBeGreaterThanOrEqual(5);
  });
  it("does NOT penalize a short keyword overlap (no 5-gram)", () => {
    const r = jdEcho(["Communicated fraud trends to stakeholders, reducing losses by $50K monthly"], jd);
    expect(r.jdEchoRate).toBe(0);
    expect(r.longestEcho).toBeLessThan(5);
  });
  it("rate is 0 for no bullets", () => {
    expect(jdEcho([], jd).jdEchoRate).toBe(0);
  });
});
