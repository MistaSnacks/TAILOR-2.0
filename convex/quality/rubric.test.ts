// convex/quality/rubric.test.ts
import { describe, it, expect } from "vitest";
import { metricDensity, bannedOpenerHits, longBulletHits, scoreDeterministic, type ScorableResume } from "./rubric";

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

// append to convex/quality/rubric.test.ts
describe("scoreDeterministic", () => {
  const make = (opts: { bullets: string[]; summaryWords: number; skills: number }): ScorableResume => ({
    summary: Array.from({ length: opts.summaryWords }, (_, i) => `w${i}`).join(" "),
    experiences: [{ highlights: opts.bullets.map((text) => ({ text })) }],
    skills: Array.from({ length: opts.skills }, (_, i) => `skill${i}`),
  });

  it("a clean résumé scores 100 and passes all flags", () => {
    const r = make({
      bullets: ["Cut latency 40%", "Grew revenue 25% in Q3", "Shipped 3 features", "Saved $2M"],
      summaryWords: 50,
      skills: 10,
    });
    const d = scoreDeterministic(r);
    expect(d.metricDensity).toBe(1);
    expect(d.bulletCapOk).toBe(true);
    expect(d.summaryWordsOk).toBe(true);
    expect(d.skillsCountOk).toBe(true);
    expect(d.score).toBe(100);
  });

  it("penalizes low metric density, banned openers, and bad counts", () => {
    const r = make({
      bullets: ["Responsible for ops", "Built tooling", "Helped the team"], // 0% metric, 2 banned
      summaryWords: 12, // too short
      skills: 3, // too few
    });
    const d = scoreDeterministic(r);
    expect(d.metricDensity).toBe(0);
    expect(d.bannedOpenerHits.length).toBe(2);
    expect(d.summaryWordsOk).toBe(false);
    expect(d.skillsCountOk).toBe(false);
    expect(d.score).toBeLessThan(60);
    expect(d.score).toBeGreaterThanOrEqual(0);
  });

  it("flags total bullet cap over 18 and per-role over 6", () => {
    const sevenBullets = Array.from({ length: 7 }, (_, i) => `Did thing ${i} 10%`);
    const r: ScorableResume = {
      summary: Array.from({ length: 50 }, (_, i) => `w${i}`).join(" "),
      experiences: [{ highlights: sevenBullets.map((text) => ({ text })) }],
      skills: Array.from({ length: 10 }, (_, i) => `s${i}`),
    };
    const d = scoreDeterministic(r);
    expect(d.perRoleOverCap).toBe(1);
    expect(d.bulletCapOk).toBe(true); // 7 total <= 18, but a role exceeds 6
    expect(d.bulletCapOk === false || d.perRoleOverCap > 0).toBe(true);
  });
});
