// convex/quality/score.ts
// Pure combiner: deterministic rubric + independent verification → persisted verdict.
import type { DeterministicReport } from "./rubric";
import type { VerificationReport } from "../llm/types";

export function hardGatesPass(ver: VerificationReport): boolean {
  return ver.truthfulnessPass && ver.fidelityPass && ver.consistencyPass;
}

export interface QualityVerdict {
  gatePass: boolean;
  gates: { truthfulness: boolean; fidelity: boolean; consistency: boolean };
  blockingReasons: string[];
  fit: {
    overall: number; // 0..100 weighted of coverage / rubric / transferability
    coverage: number;
    quality: number; // = deterministic rubric score
    transferability: number;
  };
}

export function buildQualityVerdict(
  det: DeterministicReport,
  ver: VerificationReport,
): QualityVerdict {
  const gates = {
    truthfulness: ver.truthfulnessPass,
    fidelity: ver.fidelityPass,
    consistency: ver.consistencyPass,
  };
  const gatePass = hardGatesPass(ver);

  const blockingReasons: string[] = [];
  if (!gates.truthfulness) {
    for (const b of ver.bulletVerdicts) {
      if (!b.defensible) blockingReasons.push(`Undefensible: "${b.text}"${b.reason ? ` — ${b.reason}` : ""}`);
    }
  }
  if (!gates.fidelity) blockingReasons.push(...ver.fidelityIssues);
  if (!gates.consistency) blockingReasons.push(...ver.consistencyIssues);

  const coverage = Math.round(ver.coverageScore);
  const quality = Math.round(det.score);
  const transferability = Math.round(ver.transferabilityScore);
  const overall = Math.round(coverage * 0.4 + quality * 0.35 + transferability * 0.25);

  return { gatePass, gates, blockingReasons, fit: { overall, coverage, quality, transferability } };
}
