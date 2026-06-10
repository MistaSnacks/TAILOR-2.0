// convex/quality/score.test.ts
import { describe, it, expect } from "vitest";
import { buildQualityVerdict } from "./score";
import type { DeterministicReport } from "./rubric";
import type { VerificationReport } from "../llm/types";

const det: DeterministicReport = {
  metricDensity: 1, totalBullets: 4, bulletCapOk: true, perRoleOverCap: 0,
  bannedOpenerHits: [], longBulletHits: [], summaryWords: 50, summaryWordsOk: true,
  skillsCount: 10, skillsCountOk: true, score: 100,
};

const cleanVer: VerificationReport = {
  bulletVerdicts: [{ text: "Cut latency 40%", defensible: true }],
  truthfulnessPass: true, fidelityPass: true, fidelityIssues: [],
  consistencyPass: true, consistencyIssues: [], coverageScore: 90, transferabilityScore: 80,
};

describe("buildQualityVerdict", () => {
  it("passes the gate when all three hard gates pass", () => {
    const q = buildQualityVerdict(det, cleanVer);
    expect(q.gatePass).toBe(true);
    expect(q.blockingReasons).toEqual([]);
    expect(q.fit.overall).toBe(Math.round(90 * 0.4 + 100 * 0.35 + 80 * 0.25));
  });

  it("fails the gate and collects reasons on a truthfulness violation", () => {
    const ver: VerificationReport = {
      ...cleanVer,
      truthfulnessPass: false,
      bulletVerdicts: [
        { text: "Led a $50M acquisition", defensible: false, reason: "no acquisition in profile" },
        { text: "Cut latency 40%", defensible: true },
      ],
    };
    const q = buildQualityVerdict(det, ver);
    expect(q.gatePass).toBe(false);
    expect(q.gates.truthfulness).toBe(false);
    expect(q.blockingReasons.some((r) => r.includes("Led a $50M acquisition"))).toBe(true);
  });

  it("surfaces fidelity and consistency issues as blocking reasons", () => {
    const ver: VerificationReport = {
      ...cleanVer,
      fidelityPass: false, fidelityIssues: ["endDate 2024 vs profile 2022"],
      consistencyPass: false, consistencyIssues: ["overlapping date ranges"],
    };
    const q = buildQualityVerdict(det, ver);
    expect(q.gatePass).toBe(false);
    expect(q.blockingReasons).toContain("endDate 2024 vs profile 2022");
    expect(q.blockingReasons).toContain("overlapping date ranges");
  });
});
