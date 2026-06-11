# §16 Bounded Coverage Revise Loop — Design

**Date:** 2026-06-11
**Status:** Design (approved in brainstorming; pending implementation plan)
**Implements:** §16 (bounded coverage loop) + a minimal §17 (selection-under-budget) of `docs/specs/2026-05-29-tailor-design.html`; doctrine §3, §5–§6 of `docs/research/2026-06-09-resume-quality.md`.
**Builds on:** the §7 verification gate shipped in `docs/plans/2026-06-10-verification-and-rubric.md` (the `Verifier`, `buildQualityVerdict`, deterministic `rubric`).

---

## 1. Goal

Make a finished generation the **best *defensible* résumé for the JD given the corpus** — operationalized as the *fixed point of a bounded coverage loop*, not open-ended "make it better" refinement. Today `generateFitting` does a single `generate → verify → score` with no feedback. This design adds a bounded loop that:

1. Plans a coverage map of JD requirements → corpus evidence **before any prose**.
2. After generation, deterministically diffs which *supportable* requirements failed to surface in the draft.
3. Feeds only those specific gaps back as a narrow targeted revision ("add evidence for X; change nothing else").
4. Re-verifies each round so the §7 gate is the wall that stops the loop from fabricating evidence to close a gap.
5. Halts at the fixed point (empty gap set / zero progress / max 3 rounds) and surfaces genuinely-unmet requirements as **improvement suggestions** (§3 — gaps are first-class output, not failures).

**Scope (decided in brainstorming):** §16 loop **plus a minimal §17 selector** — just enough budget reasoning to answer "would a swap fit this gap within the length budget?" so the gap-vs-real-gap distinction stays honest. The full submodular/knapsack selector (priority + recency weighting, seniority emphasis, ordering) is deferred to a later spec.

**Cost posture (decided in brainstorming):** quality first. A dedicated Planner pass runs once; each revise round re-verifies. Bounded at 2–3 rounds (~4–8 LLM calls/Fitting worst case). Cost optimization is a later concern.

---

## 2. Approach (chosen: A — plan-then-loop with a provenance-tagged coverage map)

Three **independent LLM roles**, mirroring the existing `Generator`/`Verifier` split, over **pure, unit-testable orchestration**:

- **Planner** — independent of the generator (defaults to the verifier's vendor). Sees JD + profile *only*, never a draft. Produces the coverage map.
- **Generator** — existing pass; produces the draft.
- **Reviser** — a *constrained* re-generate (shares the generator's vendor). Adds evidence for specific named gaps, changes nothing else.
- **Verifier** — existing §7 pass; adjudicates the hard gates each round.

Rejected alternatives: **B** (verifier also emits the coverage map — saves a pass but planning is no longer "before prose" and bundles "what should be covered" with "what was covered," weakening independence); **C** (trust the generator's own `requirements[].covered` — the self-grading the doctrine forbids).

**Why A:** it is the only option that honors "the coverage map is built before any prose" and keeps three decorrelated roles (plan ≠ generate ≠ verify). The deterministic diff is driven by Planner-supplied keyword *markers*, which is the spec's "computable coverage objective"; its one weakness (synonym brittleness) is mitigated by the Planner emitting marker variants.

---

## 3. Module boundaries

Every decision is a **pure function**; every LLM call is **behind an interface**. The pure modules import neither Convex nor an SDK, so they unit-test under Vitest exactly like `convex/quality/rubric.ts` does today.

| Unit | Kind | Responsibility | Tested |
|---|---|---|---|
| `convex/llm/types.ts` (extend) | types + prompts | `Planner` + `Reviser` interfaces; `CoverageMap`/`CoveragePlanItem`; `PLANNER_SYSTEM` + `REVISE_SYSTEM`. | — |
| `convex/llm/gemini.ts` / `anthropic.ts` (extend) | LLM | `GeminiPlanner`/`GeminiReviser`, `ClaudePlanner`/`ClaudeReviser`. | integration |
| `convex/llm/index.ts` (extend) | factory | `getPlanner()` (verifier's vendor — independent of generator), `getReviser()` (generator's vendor). | — |
| `convex/quality/coverage.ts` | **pure** | `draftText()`, `diffCoverage(map, text)` → `{ covered, gaps }`; marker-hit logic. | **yes** |
| `convex/quality/select.ts` | **pure** | `fitsWithinBudget(draft, gap)`; `BUDGET` constants (minimal §17). | **yes** |
| `convex/quality/loop.ts` | **pure** | `nextLoopState({gaps, prevGapCount, round, maxRounds})` → `LoopDecision`. No I/O. | **yes** |
| `convex/generate.ts` (rewrite handler) | orchestrator | Wire plan → generate → [diff → select → revise → verify]* → persist. Only place that calls LLMs + DB. | manual + fixture |

---

## 4. Data flow & the loop

```
generateFitting(jobText, profile)
│
├─ 1. PLAN (Planner LLM, once) ── CoverageMap [{requirement, supportable, evidenceRef?, expectedMarkers[]}]
│        independent vendor; sees JD + profile ONLY, never a draft ("before any prose")
│
├─ 2. GENERATE (Generator LLM) ── draft₀  (existing pass)
│
└─ LOOP round r = 0..2 (max 3):
      a. DIFF   (pure)  coverage = diffCoverage(map, draftText(draftᵣ))
                        gaps = { item | supportable && no expectedMarker present in draft }
      b. SELECT (pure)  for each gap: revise-target if fitsWithinBudget(draftᵣ, gap)
                        else → budget-blocked suggestion (a real gap)
      c. STOP?  (pure)  nextLoopState(gaps, prevGapCount, r):
                          targets empty            → CONVERGED
                          |gaps| not < prevGapCount→ STALLED
                          r == maxRounds-1         → EXHAUSTED
                          else                     → CONTINUE {targets}
      d. REVISE (Reviser LLM)  draft' = revise(jobText, profile, draftᵣ, targets)
      e. VERIFY (Verifier LLM) report = verify(jobText, profile, draft')
                          gate PASS → accept: draftᵣ₊₁ = draft'
                          gate FAIL → REJECT draft' (keep draftᵣ); reclassify the
                                      targets it chased as REAL GAPS (closing them
                                      needed fabrication) → continue with remainder
↓
FINAL: deterministic rubric + buildQualityVerdict on the ACCEPTED draft (existing path)
       improvementSuggestions = unsupportable ∪ budget-blocked ∪ gate-rejected requirements
       persist fitting { ...gen, gate, fit, coverageMap, rounds, improvementSuggestions }
```

**Invariants:**
1. **The gate-fail branch is the guarantee.** A revise that trips truthfulness/fidelity is *reverted*, and the gap it chased becomes an honest improvement suggestion. We never ship a draft that did not pass the §7 gate.
2. **Monotonic acceptance.** `draftᵣ₊₁` is only ever a gate-passing draft. If round-0 `generate` fails the gate on its own (pre-existing fabrication), that surfaces as a gate failure exactly as today; the loop does not run revise on an already-failing draft.
3. **Final verdict runs on the accepted draft**, so the persisted `gate`/`fit` always describe what the user sees. The loop's only job is to *reduce the gap set* between draft₀ and the accepted final.

---

## 5. Types & pure contracts

```ts
// convex/llm/types.ts
export interface CoveragePlanItem {
  requirement: string;        // a single JD requirement
  supportable: boolean;       // can the corpus defensibly cover it (direct or entailment)?
  evidenceRef?: string;       // which experience/skill entails it (human-readable)
  expectedMarkers: string[];  // keyword/phrase variants expected in the draft if covered
}
export type CoverageMap = CoveragePlanItem[];

export interface Planner {    // independent of the Generator
  plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap>;
}
export interface Reviser {     // constrained re-generate
  revise(jobText: string, profile: CanonicalProfile,
         draft: GeneratedResume, targets: string[]): Promise<GeneratedResume>;
}
```

```ts
// convex/quality/coverage.ts  (pure)
export function draftText(d: GeneratedResume): string;      // summary + bullets + skills, lowercased
export function diffCoverage(map: CoverageMap, text: string): {
  covered: CoveragePlanItem[]; gaps: CoveragePlanItem[];
};  // covered iff ANY expectedMarker substring-matches text; gap = supportable && !covered

// convex/quality/select.ts  (pure, minimal §17)
export const BUDGET = { maxBullets: 18, maxPerRole: 6 };
export function fitsWithinBudget(draft: GeneratedResume, gap: CoveragePlanItem): boolean;
// STUB of §17: true if total bullets < maxBullets (room to add). Full density-greedy
// swap (evict a lower-priority bullet to fit a higher-priority gap) is deferred.

// convex/quality/loop.ts  (pure)
export type LoopDecision =
  | { kind: "converged" } | { kind: "stalled" } | { kind: "exhausted" }
  | { kind: "continue"; targets: string[] };
export function nextLoopState(args: {
  gaps: CoveragePlanItem[]; prevGapCount: number; round: number; maxRounds: number;
}): LoopDecision;
```

`expectedMarkers` is what makes the diff **deterministic and synonym-tolerant** — the Planner supplies the variants ("K8s", "Kubernetes", "container orchestration"). `fitsWithinBudget` ships as an **honest stub of §17** (room-at-cap), explicitly flagged so it is not mistaken for the complete selector.

---

## 6. Prompts (constrained, in the spec's spirit)

- **`PLANNER_SYSTEM`** — "You map a JD's requirements to the candidate's corpus *before* any résumé exists. For each requirement: is it defensibly supportable from the profile (direct evidence or defensible entailment)? If so, name the evidence and the keyword variants that would prove it is covered. Mark genuinely unsupported requirements `supportable:false` — do NOT stretch. Return ONLY the coverage-map JSON." Input: JD + profile.
- **`REVISE_SYSTEM`** — "You are given a résumé draft and a short list of specific requirements it failed to surface, each of which the profile *can* defensibly support. Add or strengthen evidence for ONLY those requirements, drawn ONLY from the profile. Change nothing else — same employers, dates, structure, and untargeted bullets. Never fabricate to close a gap; if a target cannot be covered defensibly, leave it. Return the same résumé JSON shape." Input: JD + profile + draft + target requirement strings.

The Reviser returns the existing `GeneratedResume` shape, so the rest of the pipeline (cleaning, rubric, verify, persist) is unchanged.

---

## 7. Persistence (schema additions)

Extend the `fittings` table with **optional** fields (existing rows stay valid), mirroring the Task-7 pattern from the verification plan:

```ts
coverageMap: v.optional(v.array(v.object({
  requirement: v.string(),
  supportable: v.boolean(),
  evidenceRef: v.optional(v.string()),
  expectedMarkers: v.array(v.string()),
}))),
rounds: v.optional(v.number()),               // how many revise rounds ran
improvementSuggestions: v.optional(v.array(v.object({
  requirement: v.string(),
  reason: v.union(v.literal("unsupportable"), v.literal("budget"), v.literal("gate-rejected")),
}))),
```

`saveFitting` validators and `getFitting`'s return are extended to match (suggestions default `[]`, map `null`). UI surfacing of suggestions is out of scope here (follow-on).

---

## 8. Error handling & edge cases

- **Planner returns junk / empty map** → loop degrades to today's behavior (generate → verify → score, zero rounds). The loop is an enhancement; a missing map never blocks a Fitting.
- **Round-0 generate fails the gate on its own** → surfaced as a gate failure exactly as today; revise does not run on an already-failing draft.
- **Reviser throws / returns malformed** → keep the last accepted draft, treat as `exhausted`, persist what we have. No round ever leaves the fitting worse than the previous accepted draft.
- **Marker false-negative** (covered in substance, markers missed) → worst case is one wasted revise round; the gate still protects truthfulness. A cost bug, not a correctness bug — the known limitation of deterministic matching.
- **Anti-overfitting (§8):** loop logic, thresholds, and `BUDGET` constants are corpus-agnostic; validated on diverse fixtures, never tuned to one profile (including the owner's).

---

## 9. Testing strategy

- **Pure unit tests (Vitest, no LLM):** `diffCoverage` (marker hit/miss; gap = supportable && absent), `fitsWithinBudget` (room / at-cap), `nextLoopState` (converged / stalled / exhausted / continue) — table-driven like `rubric.test.ts`.
- **Loop fixture test (no live LLM):** hand-authored `CoverageMap` + scripted Planner/Reviser/Verifier stubs driving the *real* orchestrator end-to-end, asserting: (1) a supportable-but-absent requirement triggers exactly one targeted revise that closes it; (2) a revise the stub Verifier fails is *reverted* and the requirement lands in `improvementSuggestions` as `gate-rejected`; (3) the loop halts at the fixed point / max rounds. The §16 analogue of the Task-9 gate fixture.
- **Manual e2e:** real providers; confirm rounds reduce the gap set and the gate still holds; adversarially confirm a gap that needs fabrication is reverted and reported as a suggestion.

---

## 10. Out of scope (follow-on)

- **Full §17 selection** — submodular/knapsack density-greedy swap with priority + recency weighting, seniority emphasis, ordering. This spec ships only the room-at-cap stub.
- **UI surfacing** — rendering `improvementSuggestions` + coverage map in the Fitting Room.
- **Profile (Form / Part-A) quality scoring** — canonicalization recall/dedup/fidelity (doctrine §4).
- **Synthetic eval harness** — diverse ground-truth fixtures for live-LLM loop accuracy + regression gating.

---

## 11. Self-review

- **Spec coverage:** §16 plan→generate→diff→revise→fixed-point → §4 flow + §5 contracts. "Coverage map before any prose" → Planner sees JD+profile only (§2, §4). Deterministic coverage-diff → marker-based `diffCoverage` (§5). Verifier-as-wall → gate-fail revert branch (§4 invariant 1). Gaps as first-class output → `improvementSuggestions` (§4, §7). Minimal §17 → `fitsWithinBudget` stub, full selector deferred (§5, §10). Independence (verifier vendor for Planner) → §3 factory. Anti-overfitting §8 → §8. ✅
- **Placeholder scan:** no TBD/TODO; the one simplification (`fitsWithinBudget` stub) is explicitly labeled and scoped, not hidden. ✅
- **Internal consistency:** module table (§3), data flow (§4), and contracts (§5) name the same units and signatures; persistence (§7) matches the `improvementSuggestions` reasons used in §4/§9. ✅
- **Scope:** one subsystem (the coverage loop + a budget stub). Cohesive; each pure unit independently testable. ✅
```
