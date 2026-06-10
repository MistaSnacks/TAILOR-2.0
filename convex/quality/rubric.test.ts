// convex/quality/rubric.test.ts
import { describe, it, expect } from "vitest";
import { metricDensity, bannedOpenerHits, longBulletHits, type ScorableResume } from "./rubric";

const resume = (bullets: string[]): ScorableResume => ({
  summary: "",
  experiences: [{ highlights: bullets.map((text) => ({ text })) }],
  skills: [],
});

describe("rubric per-bullet checks", () => {
  it("metricDensity = fraction of bullets carrying a number/%/$", () => {
    const r = resume(["Cut latency 40%", "Built internal tooling", "Saved $2M annually"]);
    expect(metricDensity(r)).toBeCloseTo(2 / 3, 5);
  });

  it("metricDensity of an empty résumé is 0 (no division by zero)", () => {
    expect(metricDensity(resume([]))).toBe(0);
  });

  it("bannedOpenerHits flags bullets starting with a banned opener (case-insensitive)", () => {
    const r = resume(["Responsible for the roadmap", "responsible FOR ops", "Led the team"]);
    expect(bannedOpenerHits(r)).toEqual(["Responsible for the roadmap", "responsible FOR ops"]);
  });

  it("longBulletHits flags bullets over 25 words", () => {
    const long = Array.from({ length: 26 }, (_, i) => `word${i}`).join(" ");
    const r = resume([long, "Short bullet"]);
    expect(longBulletHits(r)).toEqual([long]);
  });
});
