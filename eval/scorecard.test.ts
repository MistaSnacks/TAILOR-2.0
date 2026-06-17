import { describe, it, expect } from "vitest";
import { aggregate, diffBaseline, type FixtureRow } from "./scorecard";

const row = (over: Partial<FixtureRow> = {}): FixtureRow => ({
  id: "u1", source: "real", status: "ready",
  gatePass: true, coverageHitRate: 1, jdEchoRate: 0, longestEcho: 2,
  rubricScore: 100, longBulletRate: 0, skillsCount: 18, rounds: 1,
  ...over,
});

describe("aggregate", () => {
  it("computes means over scored (non-error) rows only", () => {
    const a = aggregate([row(), row({ id: "u2", gatePass: false, coverageHitRate: 0.5, rubricScore: 80 }), row({ id: "u3", status: "error" })]);
    expect(a.n).toBe(3);
    expect(a.errors).toBe(1);
    expect(a.gatePassRate).toBe(0.5);
    expect(a.meanCoverageHitRate).toBeCloseTo(0.75);
    expect(a.meanRubricScore).toBe(90);
  });
});

describe("diffBaseline", () => {
  const base = aggregate([row(), row()]);
  it("flags a coverage drop and a naturalness regression beyond delta", () => {
    const now = aggregate([row({ coverageHitRate: 0.6 }), row({ jdEchoRate: 0.4 })]);
    const flags = diffBaseline(now, base, 0.05);
    expect(flags.some((f) => f.includes("coverage"))).toBe(true);
    expect(flags.some((f) => f.includes("jdEcho"))).toBe(true);
  });
  it("no flags when within delta", () => {
    expect(diffBaseline(aggregate([row(), row()]), base, 0.05)).toEqual([]);
  });
});
