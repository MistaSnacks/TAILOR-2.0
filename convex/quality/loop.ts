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

import type {
  CoverageMap,
  CanonicalProfile,
  GeneratedResume,
  Generator,
  Planner,
  Reviser,
  Verifier,
  VerificationReport,
} from "../llm/types";
import { diffCoverage, draftText } from "./coverage";
import { fitsWithinBudget } from "./select";
import { hardGatesPass } from "./score";

export type SuggestionReason = "unsupportable" | "budget" | "gate-rejected";
export interface ImprovementSuggestion {
  requirement: string;
  reason: SuggestionReason;
}
export interface LoopDeps {
  jobText: string;
  profile: CanonicalProfile;
  planner: Planner;
  generator: Generator;
  reviser: Reviser;
  verifier: Verifier;
  maxRounds?: number; // default 3
}
export interface LoopResult {
  draft: GeneratedResume; // the ACCEPTED (gate-passing) final draft
  verification: VerificationReport; // verification of the accepted draft
  coverageMap: CoverageMap;
  rounds: number; // successful revise rounds applied
  improvementSuggestions: ImprovementSuggestion[];
}

/**
 * Bounded coverage loop (§16): plan → generate → [diff → select → revise → verify]* → fixed point.
 * The §7 verifier is the wall — a revise that trips a hard gate is reverted and its targets become
 * gate-rejected suggestions. The accepted draft is only ever a gate-passing draft.
 */
export async function runCoverageLoop(deps: LoopDeps): Promise<LoopResult> {
  const { jobText, profile, planner, generator, reviser, verifier } = deps;
  const maxRounds = deps.maxRounds ?? 3;

  // 1. PLAN (independent; before any prose). A bad map degrades to single-shot behavior.
  let coverageMap: CoverageMap = [];
  try {
    const planned = await planner.plan(jobText, profile);
    if (Array.isArray(planned)) coverageMap = planned;
  } catch {
    coverageMap = [];
  }

  // 2. GENERATE + verify the base draft.
  let accepted = await generator.generate(jobText, profile);
  let acceptedVer = await verifier.verify(jobText, profile, accepted);

  const suggestions: ImprovementSuggestion[] = [];
  const addSuggestions = (requirements: string[], reason: SuggestionReason) => {
    for (const requirement of requirements) {
      if (!suggestions.some((s) => s.requirement === requirement)) {
        suggestions.push({ requirement, reason });
      }
    }
  };
  // Unsupportable requirements are gaps from the start (§3 — gaps are first-class output).
  addSuggestions(coverageMap.filter((i) => !i.supportable).map((i) => i.requirement), "unsupportable");

  // Invariant: never revise an already-failing draft — surface its gate failure as today.
  if (!hardGatesPass(acceptedVer)) {
    return { draft: accepted, verification: acceptedVer, coverageMap, rounds: 0, improvementSuggestions: suggestions };
  }

  // 3. LOOP.
  let rounds = 0;
  let prevGapCount = Number.POSITIVE_INFINITY;
  for (;;) {
    const { gaps } = diffCoverage(coverageMap, draftText(accepted));
    const fitGaps = gaps.filter((g) => fitsWithinBudget(accepted, g));
    addSuggestions(gaps.filter((g) => !fitsWithinBudget(accepted, g)).map((g) => g.requirement), "budget");

    const decision = nextLoopState({ gaps: fitGaps, prevGapCount, round: rounds, maxRounds });
    if (decision.kind !== "continue") break;

    let revised: GeneratedResume;
    try {
      revised = await reviser.revise(jobText, profile, accepted, decision.targets);
    } catch {
      break; // malformed/throwing revise → keep the last accepted draft
    }
    const revVer = await verifier.verify(jobText, profile, revised);
    if (hardGatesPass(revVer)) {
      accepted = revised;
      acceptedVer = revVer;
      prevGapCount = fitGaps.length;
      rounds += 1;
    } else {
      // The revise had to fabricate to close these targets → revert; they are real gaps.
      addSuggestions(decision.targets, "gate-rejected");
      break;
    }
  }

  return { draft: accepted, verification: acceptedVer, coverageMap, rounds, improvementSuggestions: suggestions };
}
