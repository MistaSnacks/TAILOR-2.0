// convex/quality/gate.fixture.test.ts
import { describe, it, expect } from "vitest";
import { scoreDeterministic, type ScorableResume } from "./rubric";
import { buildQualityVerdict } from "./score";
import type { VerificationReport } from "../llm/types";

// A résumé that is mechanically clean but contains one fabricated bullet.
const resume: ScorableResume = {
  summary: Array.from({ length: 50 }, (_, i) => `w${i}`).join(" "),
  experiences: [
    { highlights: [
      { text: "Cut p99 latency 40% by sharding the write path" },
      { text: "Led a $50M acquisition of a competitor" }, // planted fabrication
      { text: "Shipped 3 GA features in 2 quarters" },
      { text: "Reduced on-call pages 60%" },
    ] },
  ],
  skills: Array.from({ length: 10 }, (_, i) => `skill${i}`),
};

// What an honest verifier would return for the above.
const report: VerificationReport = {
  bulletVerdicts: [
    { text: "Cut p99 latency 40% by sharding the write path", defensible: true, evidence: "Infra role bullet" },
    { text: "Led a $50M acquisition of a competitor", defensible: false, reason: "no M&A anywhere in profile" },
    { text: "Shipped 3 GA features in 2 quarters", defensible: true },
    { text: "Reduced on-call pages 60%", defensible: true },
  ],
  truthfulnessPass: false,
  fidelityPass: true, fidelityIssues: [],
  consistencyPass: true, consistencyIssues: [],
  coverageScore: 85, transferabilityScore: 70,
};

describe("gate fixture", () => {
  it("blocks a mechanically-clean résumé that hides a fabrication", () => {
    const det = scoreDeterministic(resume);
    expect(det.score).toBeGreaterThanOrEqual(90); // looks great mechanically
    const verdict = buildQualityVerdict(det, report);
    expect(verdict.gatePass).toBe(false); // …but truthfulness gate blocks it
    expect(verdict.blockingReasons.some((r) => r.includes("$50M acquisition"))).toBe(true);
  });
});
