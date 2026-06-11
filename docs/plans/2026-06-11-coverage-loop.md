# §16 Bounded Coverage Revise Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-shot `generate → verify` with a bounded coverage loop (`plan → generate → coverage-diff → targeted revise → fixed point`) that maximizes corpus-defensible JD coverage and surfaces genuine gaps as improvement suggestions.

**Architecture:** Three independent LLM roles (Planner, Reviser, plus the existing Generator/Verifier) over pure, unit-testable orchestration. A dependency-injected `runCoverageLoop()` holds the loop logic (LLM roles passed in as interfaces — no Convex/SDK imports), so it unit-tests with scripted stubs; `generateFitting` becomes a thin wire-up that injects real providers and persists. The §7 verifier is the wall: a revise that trips a hard gate is reverted and its target becomes an honest gap.

**Tech Stack:** Convex (TS functions, document DB), `@google/genai` + `@anthropic-ai/sdk` via the existing `convex/llm` factory, Vitest.

**Source of truth:** `docs/specs/2026-06-11-coverage-loop-design.md` (design); §16–§17 of `docs/specs/2026-05-29-tailor-design.html`; doctrine §3/§5/§6 of `docs/research/2026-06-09-resume-quality.md`.

---

## File Structure

| File | Responsibility | LLM? | Unit-tested? |
|---|---|---|---|
| `convex/llm/types.ts` | Add `CoveragePlanItem`/`CoverageMap`, `Planner`/`Reviser` interfaces, `PLANNER_SYSTEM`/`REVISE_SYSTEM`. | — | — |
| `convex/quality/coverage.ts` | Pure `draftText()`, `diffCoverage(map, text)` → `{covered, gaps}`. | No | Yes (Task 2) |
| `convex/quality/select.ts` | Pure `BUDGET`, `fitsWithinBudget(draft, gap)` — minimal §17. | No | Yes (Task 3) |
| `convex/quality/loop.ts` | Pure `nextLoopState()` + DI `runCoverageLoop(deps)` orchestrator + `LoopResult`/`ImprovementSuggestion` types. | No (roles injected) | Yes (Tasks 4–5) |
| `convex/quality/score.ts` | Add exported `hardGatesPass(ver)` and reuse it in `buildQualityVerdict`. | No | Yes (existing) |
| `convex/llm/gemini.ts` / `anthropic.ts` | Add `GeminiPlanner`/`GeminiReviser`, `ClaudePlanner`/`ClaudeReviser`. | Yes | No (integration) |
| `convex/llm/index.ts` | Add `getPlanner()` (verifier's vendor — independent of generator), `getReviser()` (generator's vendor). | — | No |
| `convex/schema.ts` | Extend `fittings` with optional `coverageMap`, `rounds`, `improvementSuggestions`. | — | — |
| `convex/fittings.ts` | Extend `saveFitting` validators + `getFitting` return. | — | — |
| `convex/generate.ts` | Wire `runCoverageLoop` + persist the new fields. | — | No (manual) |

---

## Task 1: Coverage types + Planner/Reviser interfaces + prompts

Define the verification-style contract for the two new roles. Pure type/const additions; no behavior to test.

**Files:**
- Modify: `convex/llm/types.ts` (append after the verification block, end of file)

- [ ] **Step 1: Append the coverage types, interfaces, and prompts**

```ts
// append to convex/llm/types.ts

// ---- Coverage planning + revision (§16 bounded coverage loop) ----
export interface CoveragePlanItem {
  requirement: string;        // a single JD requirement
  supportable: boolean;       // can the corpus defensibly cover it (direct or entailment)?
  evidenceRef?: string;       // which experience/skill entails it (human-readable)
  expectedMarkers: string[];  // keyword/phrase variants expected in the draft if covered
}
export type CoverageMap = CoveragePlanItem[];

/** Maps a JD's requirements to corpus evidence BEFORE any prose exists (§16 plan step). */
export interface Planner {
  plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap>;
}

/** Constrained re-generate: surface evidence for specific gaps, change nothing else (§16 revise step). */
export interface Reviser {
  revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
  ): Promise<GeneratedResume>;
}

export const PLANNER_SYSTEM =
  "You are TAILOR's coverage PLANNER. You map a job description's requirements to the candidate's canonical " +
  "PROFILE BEFORE any résumé exists. You do NOT write a résumé. For EACH distinct requirement in the JD decide: " +
  "is it defensibly supportable from the profile — directly stated OR a defensible entailment of profile evidence " +
  "(e.g. 'used Tableau' entails 'data visualization')? If supportable, name the evidence (which experience or skill) " +
  "and list the keyword/phrase VARIANTS that would prove it is covered if they appear in the résumé (e.g. " +
  "['Kubernetes','K8s','container orchestration']). Mark genuinely unsupported requirements supportable:false — " +
  "do NOT stretch. Return ONLY JSON: " +
  '{"coverage":[{"requirement":string,"supportable":boolean,"evidenceRef":string,"expectedMarkers":[string]}]}.';

export const REVISE_SYSTEM =
  "You are TAILOR's résumé REVISER. You are given a job description, the candidate's canonical PROFILE, an existing " +
  "résumé DRAFT, and a short list of TARGET requirements the draft failed to surface — each of which the profile " +
  "CAN defensibly support. Add or strengthen evidence for ONLY those targets, drawn ONLY from the profile. Change " +
  "NOTHING else: keep every other bullet, the summary, employers, positions, and dates exactly as in the draft. " +
  "Never fabricate to close a gap; if a target cannot be covered defensibly, leave the draft unchanged for it. " +
  "Obey the same grounding and bullet-quality rules as generation. Return the SAME résumé JSON shape as the draft: " +
  '{"summary":string,"experiences":[{"company","position","startDate","endDate","highlights":[{"text","type","relationship"}]}],"skills":[string],"requirements":[{"text","covered"}],"keywords":[string]}.';
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: no errors (types reference `CanonicalProfile` and `GeneratedResume` already defined above in this file).

- [ ] **Step 3: Commit**

```bash
git add convex/llm/types.ts
git commit -m "feat(quality): Planner/Reviser interfaces + coverage types + prompts (§16)"
```

---

## Task 2: Pure coverage diff

Build the deterministic coverage-diff: which supportable requirements failed to surface in the draft text.

**Files:**
- Create: `convex/quality/coverage.ts`
- Test: `convex/quality/coverage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/quality/coverage.test.ts
import { describe, it, expect } from "vitest";
import { draftText, diffCoverage } from "./coverage";
import type { CoverageMap } from "../llm/types";
import type { GeneratedResume } from "../llm/types";

const draft: GeneratedResume = {
  summary: "Backend engineer scaling Kubernetes clusters",
  experiences: [
    { company: "Acme", position: "SWE", highlights: [
      { text: "Cut p99 latency 40% with Redis caching", type: "rephrase" },
    ] },
  ],
  skills: ["PostgreSQL", "Go"],
  requirements: [],
  keywords: [],
};

describe("draftText", () => {
  it("concatenates summary + bullets + skills, lowercased", () => {
    const t = draftText(draft);
    expect(t).toContain("kubernetes");
    expect(t).toContain("redis caching");
    expect(t).toContain("postgresql");
    expect(t).toBe(t.toLowerCase());
  });
});

describe("diffCoverage", () => {
  const map: CoverageMap = [
    { requirement: "Container orchestration", supportable: true, expectedMarkers: ["kubernetes", "k8s"] },
    { requirement: "Message queues", supportable: true, expectedMarkers: ["kafka", "rabbitmq"] },
    { requirement: "PhD in physics", supportable: false, expectedMarkers: ["phd"] },
  ];

  it("covered = supportable item with a marker present; gap = supportable item with none", () => {
    const { covered, gaps } = diffCoverage(map, draftText(draft));
    expect(covered.map((i) => i.requirement)).toEqual(["Container orchestration"]);
    expect(gaps.map((i) => i.requirement)).toEqual(["Message queues"]);
  });

  it("never treats an unsupportable item as a gap (gaps are supportable-only)", () => {
    const { covered, gaps } = diffCoverage(map, draftText(draft));
    expect([...covered, ...gaps].some((i) => i.supportable === false)).toBe(false);
  });

  it("matches markers case-insensitively", () => {
    const { covered } = diffCoverage(
      [{ requirement: "Orchestration", supportable: true, expectedMarkers: ["KUBERNETES"] }],
      draftText(draft),
    );
    expect(covered.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quality/coverage.test.ts`
Expected: FAIL — `Cannot find module './coverage'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/quality/coverage.ts
// Pure, LLM-free coverage diff for the §16 loop. No Convex/node imports.
import type { CoverageMap, CoveragePlanItem, GeneratedResume } from "../llm/types";

/** Flatten a draft to a single lowercased haystack: summary + all bullets + skills. */
export function draftText(d: GeneratedResume): string {
  const bullets = d.experiences.flatMap((e) => e.highlights.map((h) => h.text));
  return [d.summary, ...bullets, ...d.skills].join(" ").toLowerCase();
}

/** A supportable requirement is "covered" iff ANY of its expectedMarkers appears in the draft text. */
export function diffCoverage(
  map: CoverageMap,
  text: string,
): { covered: CoveragePlanItem[]; gaps: CoveragePlanItem[] } {
  const covered: CoveragePlanItem[] = [];
  const gaps: CoveragePlanItem[] = [];
  for (const item of map) {
    if (!item.supportable) continue; // unsupportable requirements are not coverage gaps; they are suggestions
    const hit = item.expectedMarkers.some((m) => m.trim() && text.includes(m.toLowerCase()));
    (hit ? covered : gaps).push(item);
  }
  return { covered, gaps };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/quality/coverage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/coverage.ts convex/quality/coverage.test.ts
git commit -m "feat(quality): deterministic coverage diff (marker-based) (§16)"
```

---

## Task 3: Pure budget selector (minimal §17)

The "would a swap fit this gap within the length budget?" check. Ships as an honest room-at-cap stub; the full density-greedy swap is deferred (design §10).

**Files:**
- Create: `convex/quality/select.ts`
- Test: `convex/quality/select.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quality/select.test.ts`
Expected: FAIL — `Cannot find module './select'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/quality/select.ts
// Pure, minimal §17 selector. Ships a room-at-cap stub; full density-greedy
// swap (evict a lower-priority bullet to fit a higher-priority gap) is deferred
// (see docs/specs/2026-06-11-coverage-loop-design.md §10). No Convex/node imports.
import type { GeneratedResume, CoveragePlanItem } from "../llm/types";

export const BUDGET = { maxBullets: 18, maxPerRole: 6 } as const;

export function totalBullets(d: GeneratedResume): number {
  return d.experiences.reduce((n, e) => n + e.highlights.length, 0);
}

/**
 * Can the draft accommodate a bullet that closes `gap` within the length budget?
 * STUB: true iff the draft is under the total bullet cap (there is room to add).
 * `gap` is accepted for the eventual density-greedy swap signature but unused today.
 */
export function fitsWithinBudget(draft: GeneratedResume, _gap: CoveragePlanItem): boolean {
  return totalBullets(draft) < BUDGET.maxBullets;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/quality/select.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/select.ts convex/quality/select.test.ts
git commit -m "feat(quality): minimal §17 budget selector (room-at-cap stub)"
```

---

## Task 4: Pure fixed-point decision

`nextLoopState` decides each round whether to revise, converge, stall, or stop.

**Files:**
- Create: `convex/quality/loop.ts`
- Test: `convex/quality/loop.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/quality/loop.test.ts
import { describe, it, expect } from "vitest";
import { nextLoopState } from "./loop";
import type { CoveragePlanItem } from "../llm/types";

const gap = (requirement: string): CoveragePlanItem => ({ requirement, supportable: true, expectedMarkers: [requirement.toLowerCase()] });

describe("nextLoopState", () => {
  it("converged when there are no gaps (even at the round cap)", () => {
    expect(nextLoopState({ gaps: [], prevGapCount: 5, round: 3, maxRounds: 3 })).toEqual({ kind: "converged" });
  });

  it("exhausted when rounds already hit the cap and gaps remain", () => {
    expect(nextLoopState({ gaps: [gap("a")], prevGapCount: 99, round: 3, maxRounds: 3 })).toEqual({ kind: "exhausted" });
  });

  it("stalled when this round did not reduce the gap count", () => {
    expect(nextLoopState({ gaps: [gap("a"), gap("b")], prevGapCount: 2, round: 1, maxRounds: 3 })).toEqual({ kind: "stalled" });
  });

  it("continues with target requirement strings when gaps shrank and rounds remain", () => {
    const d = nextLoopState({ gaps: [gap("a")], prevGapCount: 3, round: 1, maxRounds: 3 });
    expect(d).toEqual({ kind: "continue", targets: ["a"] });
  });

  it("first round (prevGapCount = Infinity) continues", () => {
    const d = nextLoopState({ gaps: [gap("a"), gap("b")], prevGapCount: Number.POSITIVE_INFINITY, round: 0, maxRounds: 3 });
    expect(d).toEqual({ kind: "continue", targets: ["a", "b"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quality/loop.test.ts`
Expected: FAIL — `Cannot find module './loop'`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/quality/loop.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/loop.ts convex/quality/loop.test.ts
git commit -m "feat(quality): pure fixed-point decision for the coverage loop (§16)"
```

---

## Task 5: The injected loop orchestrator + hard-gate helper

Add `hardGatesPass` to `score.ts` (DRY: one definition of "all three gates pass"), then `runCoverageLoop` — the dependency-injected loop that holds all the orchestration and is tested with scripted stubs.

**Files:**
- Modify: `convex/quality/score.ts` (add + reuse `hardGatesPass`)
- Modify: `convex/quality/loop.ts` (append `runCoverageLoop` + types)
- Test: `convex/quality/loop.test.ts` (append fixture tests)

- [ ] **Step 1: Add `hardGatesPass` to `convex/quality/score.ts` and reuse it**

Add the export and refactor `buildQualityVerdict` to call it:

```ts
// add near the top of convex/quality/score.ts, after the imports
export function hardGatesPass(ver: VerificationReport): boolean {
  return ver.truthfulnessPass && ver.fidelityPass && ver.consistencyPass;
}
```

Then in `buildQualityVerdict`, replace the `gatePass` line:

```ts
  const gatePass = hardGatesPass(ver);
```

(Leave the `gates` object and everything else unchanged.)

- [ ] **Step 2: Append `runCoverageLoop` to `convex/quality/loop.ts`**

```ts
// append to convex/quality/loop.ts
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
```

- [ ] **Step 3: Append the fixture tests to `convex/quality/loop.test.ts`**

```ts
// append to convex/quality/loop.test.ts
import { runCoverageLoop } from "./loop";
import type {
  CanonicalProfile,
  CoverageMap,
  GeneratedResume,
  Planner,
  Generator,
  Reviser,
  Verifier,
  VerificationReport,
} from "../llm/types";

const PROFILE = { basics: { profiles: [] }, experiences: [], skills: [], education: [] } as unknown as CanonicalProfile;
const bulletDraft = (texts: string[]): GeneratedResume => ({
  summary: "engineer",
  experiences: [{ company: "Acme", position: "SWE", highlights: texts.map((t) => ({ text: t, type: "rephrase" as const })) }],
  skills: [],
  requirements: [],
  keywords: [],
});
const PASS: VerificationReport = {
  bulletVerdicts: [], truthfulnessPass: true, fidelityPass: true, fidelityIssues: [],
  consistencyPass: true, consistencyIssues: [], coverageScore: 80, transferabilityScore: 70,
};
const FAIL: VerificationReport = { ...PASS, truthfulnessPass: false };

const planner = (map: CoverageMap): Planner => ({ plan: async () => map });
const generator = (draft: GeneratedResume): Generator => ({ generate: async () => draft });
// Verifier fails any draft whose text contains the sentinel "fabricated".
const verifier = (): Verifier => ({ verify: async (_j, _p, r) => (JSON.stringify(r).includes("fabricated") ? FAIL : PASS) });

const SUPPORTABLE_K8S: CoverageMap = [{ requirement: "Kubernetes", supportable: true, expectedMarkers: ["kubernetes"] }];

describe("runCoverageLoop", () => {
  it("closes a supportable-but-absent requirement in exactly one revise round", async () => {
    const reviser: Reviser = { revise: async (_j, _p, d) => bulletDraft([...d.experiences[0].highlights.map((h) => h.text), "Ran kubernetes in prod"]) };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(SUPPORTABLE_K8S), generator: generator(bulletDraft(["Cut latency 40%"])),
      reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(1);
    expect(draftTextHas(res.draft, "kubernetes")).toBe(true);
    expect(res.improvementSuggestions).toEqual([]);
  });

  it("reverts a revise that trips the gate and records a gate-rejected suggestion", async () => {
    const base = bulletDraft(["Cut latency 40%"]);
    const reviser: Reviser = { revise: async () => bulletDraft(["Cut latency 40%", "Led a fabricated $50M deal"]) };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(SUPPORTABLE_K8S), generator: generator(base), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(0);
    expect(res.draft).toEqual(base); // reverted to the pre-revise draft
    expect(res.improvementSuggestions).toContainEqual({ requirement: "Kubernetes", reason: "gate-rejected" });
  });

  it("halts (stalls) when a revise closes no gaps", async () => {
    const base = bulletDraft(["Cut latency 40%"]);
    const reviser: Reviser = { revise: async (_j, _p, d) => d }; // never adds the marker
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(SUPPORTABLE_K8S), generator: generator(base), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(1); // one revise applied (gate passed), then stalled
  });

  it("surfaces unsupportable requirements as suggestions and does not loop on them", async () => {
    const map: CoverageMap = [{ requirement: "PhD", supportable: false, expectedMarkers: ["phd"] }];
    const reviser: Reviser = { revise: async (_j, _p, d) => d };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner(map), generator: generator(bulletDraft(["Cut latency 40%"])), reviser, verifier: verifier(),
    });
    expect(res.rounds).toBe(0);
    expect(res.improvementSuggestions).toEqual([{ requirement: "PhD", reason: "unsupportable" }]);
  });
});

function draftTextHas(d: GeneratedResume, needle: string): boolean {
  return [d.summary, ...d.experiences.flatMap((e) => e.highlights.map((h) => h.text)), ...d.skills]
    .join(" ").toLowerCase().includes(needle);
}
```

- [ ] **Step 4: Run the loop tests**

Run: `npx vitest run convex/quality/loop.test.ts convex/quality/score.test.ts`
Expected: PASS — the 5 `nextLoopState` tests, the 4 `runCoverageLoop` tests, and the existing 3 score tests (still green after the `hardGatesPass` refactor).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/loop.ts convex/quality/loop.test.ts convex/quality/score.ts
git commit -m "feat(quality): injected coverage-loop orchestrator + hardGatesPass helper (§16)"
```

---

## Task 6: Planner + Reviser provider impls + factory

Add the four provider classes and the two factory functions. Planner is independent of the generator (verifier's vendor); Reviser shares the generator's vendor.

**Files:**
- Modify: `convex/llm/gemini.ts`, `convex/llm/anthropic.ts`, `convex/llm/index.ts`

- [ ] **Step 1: Add `GeminiPlanner` + `GeminiReviser` to `convex/llm/gemini.ts`**

Extend the import from `./types` with `PLANNER_SYSTEM, REVISE_SYSTEM, type Planner, type Reviser, type CoverageMap`, then append:

```ts
export class GeminiPlanner implements Planner {
  async plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap> {
    const out = (await jsonCall(PLANNER_SYSTEM, JSON.stringify({ jobDescription: jobText, profile }))) as { coverage?: CoverageMap };
    return Array.isArray(out?.coverage) ? out.coverage : [];
  }
}

export class GeminiReviser implements Reviser {
  async revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
  ): Promise<GeneratedResume> {
    return (await jsonCall(
      REVISE_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, draft, targets }),
    )) as GeneratedResume;
  }
}
```

- [ ] **Step 2: Add `ClaudePlanner` + `ClaudeReviser` to `convex/llm/anthropic.ts`**

Extend the import from `./types` with `PLANNER_SYSTEM, REVISE_SYSTEM, type Planner, type Reviser, type CoverageMap`, then append (this file's JSON helper is the free function `call`):

```ts
export class ClaudePlanner implements Planner {
  async plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap> {
    const out = (await call(PLANNER_SYSTEM, JSON.stringify({ jobDescription: jobText, profile }))) as { coverage?: CoverageMap };
    return Array.isArray(out?.coverage) ? out.coverage : [];
  }
}

export class ClaudeReviser implements Reviser {
  async revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
  ): Promise<GeneratedResume> {
    return (await call(
      REVISE_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, draft, targets }),
    )) as GeneratedResume;
  }
}
```

- [ ] **Step 3: Add `getPlanner()` + `getReviser()` to `convex/llm/index.ts`**

Extend the imports and add the two factories:

```ts
import type { Generator, ProfileBuilder, Verifier, Planner, Reviser } from "./types";
import { GeminiGenerator, GeminiProfileBuilder, GeminiVerifier, GeminiPlanner, GeminiReviser } from "./gemini";
import { ClaudeGenerator, ClaudeProfileBuilder, ClaudeVerifier, ClaudePlanner, ClaudeReviser } from "./anthropic";
```

```ts
// Planner is independent of the Generator — reuse the verifier's vendor rule.
export function getPlanner(): Planner {
  const chosen = pickVerifierProvider(provider(), process.env);
  return chosen === "anthropic" ? new ClaudePlanner() : new GeminiPlanner();
}
// Reviser is a constrained re-generate — same vendor as the Generator.
export function getReviser(): Reviser {
  return provider() === "anthropic" ? new ClaudeReviser() : new GeminiReviser();
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: no errors. Fix any import mismatches until clean.

- [ ] **Step 5: Commit**

```bash
git add convex/llm/gemini.ts convex/llm/anthropic.ts convex/llm/index.ts
git commit -m "feat(quality): Gemini/Claude Planner+Reviser impls + getPlanner/getReviser factory (§16)"
```

---

## Task 7: Persist coverage map, rounds, and improvement suggestions

Extend `fittings` with optional fields so existing rows stay valid.

**Files:**
- Modify: `convex/schema.ts` (inside `fittings`, after the `bulletVerdicts` field, before `}).index("by_job"...)`)
- Modify: `convex/fittings.ts` (`saveFitting.args` and `getFitting` return)

- [ ] **Step 1: Extend the schema**

In `convex/schema.ts`, add these three fields immediately after the `bulletVerdicts` block (still inside `fittings`):

```ts
    coverageMap: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          supportable: v.boolean(),
          evidenceRef: v.optional(v.string()),
          expectedMarkers: v.array(v.string()),
        }),
      ),
    ),
    rounds: v.optional(v.number()),
    improvementSuggestions: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          reason: v.union(v.literal("unsupportable"), v.literal("budget"), v.literal("gate-rejected")),
        }),
      ),
    ),
```

- [ ] **Step 2: Mirror the validators in `saveFitting.args`**

In `convex/fittings.ts`, add the same three optional validators to `saveFitting.args`, immediately after the `bulletVerdicts` validator (the handler stays `ctx.db.insert("fittings", args)`):

```ts
    coverageMap: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          supportable: v.boolean(),
          evidenceRef: v.optional(v.string()),
          expectedMarkers: v.array(v.string()),
        }),
      ),
    ),
    rounds: v.optional(v.number()),
    improvementSuggestions: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          reason: v.union(v.literal("unsupportable"), v.literal("budget"), v.literal("gate-rejected")),
        }),
      ),
    ),
```

- [ ] **Step 3: Expose the new fields in `getFitting`**

In the `getFitting` return object (`convex/fittings.ts`), add after `bulletVerdicts: f.bulletVerdicts ?? [],`:

```ts
      coverageMap: f.coverageMap ?? [],
      rounds: f.rounds ?? 0,
      improvementSuggestions: f.improvementSuggestions ?? [],
```

- [ ] **Step 4: Typecheck + push schema (dev)**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: clean.
Then (with `npm run dev:backend` running, or once): `npx convex dev --once`
Expected: schema deploys without validator errors. If old `fittings` rows block the optional-field migration, clear them in the Convex dashboard (dev data only).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/fittings.ts
git commit -m "feat(quality): persist coverageMap + rounds + improvementSuggestions on fittings (§16)"
```

---

## Task 8: Wire `runCoverageLoop` into `generateFitting`

Replace the single-shot `generate → verify` block with the loop, then run the existing rubric/verdict on the accepted draft and persist the new fields.

**Files:**
- Modify: `convex/generate.ts`

- [ ] **Step 1: Update imports**

At the top of `convex/generate.ts`, replace the llm + quality imports with:

```ts
import { getGenerator, getVerifier, getPlanner, getReviser } from "./llm";
import type { CanonicalProfile } from "./llm";
import { scoreDeterministic, type ScorableResume } from "./quality/rubric";
import { buildQualityVerdict } from "./quality/score";
import { runCoverageLoop } from "./quality/loop";
```

- [ ] **Step 2: Run the loop instead of a single generate+verify**

Replace the block from `const gen = await getGenerator().generate(...)` down through `const verdict = buildQualityVerdict(deterministic, verification);` (current lines ~54–85) with:

```ts
    // §16 bounded coverage loop: plan → generate → diff → revise → fixed point.
    const loop = await runCoverageLoop({
      jobText: rawText,
      profile: canonical,
      planner: getPlanner(),
      generator: getGenerator(),
      reviser: getReviser(),
      verifier: getVerifier(),
    });
    const gen = loop.draft;
    const verification = loop.verification;

    const experiences = (gen.experiences ?? [])
      .filter((e) => e && e.company)
      .map((e) => ({
        company: e.company,
        position: e.position ?? "",
        ...(e.startDate ? { startDate: e.startDate } : {}),
        ...(e.endDate ? { endDate: e.endDate } : {}),
        highlights: (e.highlights ?? [])
          .filter((h) => h && typeof h.text === "string" && h.text.trim().length > 0)
          .map((h) => ({
            text: h.text,
            type: VALID.includes(h.type) ? h.type : "rephrase",
            ...(h.relationship ? { relationship: String(h.relationship) } : {}),
          })),
      }))
      .filter((e) => e.highlights.length > 0);

    const skills = (gen.skills ?? []).filter((sk) => typeof sk === "string" && sk.trim());

    // Deterministic rubric over the cleaned, ACCEPTED résumé.
    const scorable: ScorableResume = {
      summary: gen.summary ?? "",
      experiences: experiences.map((e) => ({ highlights: e.highlights.map((h) => ({ text: h.text })) })),
      skills,
    };
    const deterministic = scoreDeterministic(scorable);
    const verdict = buildQualityVerdict(deterministic, verification);
```

> Note: the replaced range (current lines ~54–85) already contains the original `gen`, `experiences`, `skills`, `verification`, `deterministic`, and `verdict` definitions — the new block above redefines all of them in the correct order (accepted `gen` first, then derive `experiences`/`skills` from it). Replace the whole range in one edit so there are no duplicate `const` declarations left behind.

- [ ] **Step 3: Persist the loop outputs in the `saveFitting` call**

In the existing `saveFitting` call, add the three new fields alongside `bulletVerdicts: verification.bulletVerdicts,`:

```ts
      coverageMap: loop.coverageMap,
      rounds: loop.rounds,
      improvementSuggestions: loop.improvementSuggestions,
```

(The `fit`, `gate`, legacy `keyword`/`requirement` computations are unchanged — they already run on `gen`/`experiences`/`skills`/`verdict`.)

- [ ] **Step 4: Update the handler doc comment**

Replace the "Still TODO: the §16 coverage *revise* loop…" sentence in the block comment above `generateFitting` with:

```ts
 * Runs the §16 bounded coverage loop (plan → generate → diff → targeted revise → fixed point)
 * with an independent cross-vendor verifier (§7) gating every round; genuine gaps are persisted
 * as improvementSuggestions. Full §17 selection (density-greedy swap) is still a follow-on.
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS — all coverage/select/loop/score/rubric/verifier-select/gate-fixture and pre-existing tests green.

- [ ] **Step 7: Manual end-to-end verification**

With `npm run dev` + `npm run dev:backend` running and a profile already built, generate a Fitting. Confirm in the Convex dashboard that the new row has: a non-empty `coverageMap`, a `rounds` count (0–3), and `improvementSuggestions` for any unsupported JD requirement. Then **adversarially test the loop**: paste a JD with a requirement the profile cannot defensibly support, regenerate, and confirm it appears in `improvementSuggestions` (reason `unsupportable` or `gate-rejected`) rather than being fabricated into a bullet — and that `gate.pass` stays `true`. (Requires `ANTHROPIC_API_KEY` on the deployment for cross-vendor independence; otherwise Planner/Verifier fall back to the generator's vendor.)

- [ ] **Step 8: Commit**

```bash
git add convex/generate.ts
git commit -m "feat(quality): wire §16 coverage loop into generateFitting"
```

---

## Out of scope (follow-on plans)

- **Full §17 selection** — submodular/knapsack density-greedy swap (priority + recency weighting, seniority emphasis, ordering). This plan ships only the room-at-cap stub.
- **UI surfacing** — rendering `improvementSuggestions` + the coverage map in the Fitting Room.
- **Profile (Form / Part-A) quality scoring** — doctrine §4 canonicalization recall/dedup/fidelity.
- **Synthetic eval harness** — diverse ground-truth fixtures for live-LLM loop accuracy + regression gating.

---

## Self-Review

- **Spec coverage (design doc):** Planner/Reviser interfaces + prompts → Task 1. Deterministic coverage-diff (markers) → Task 2 (design §5). Minimal §17 `fitsWithinBudget` stub → Task 3 (§5/§10). Fixed-point decision → Task 4 (§4). Injected orchestrator + gate-fail revert + suggestion taxonomy + degrade-on-bad-plan + don't-revise-failing-draft → Task 5 (§4 invariants, §8 error handling). Independent Planner vendor / generator-vendor Reviser → Task 6 (§3). Persistence of coverageMap/rounds/improvementSuggestions → Task 7 (§7). Wire into generateFitting; final verdict on accepted draft → Task 8 (§4 invariant 3). Testing: pure unit tests (Tasks 2–4) + no-live-LLM fixture (Task 5) + manual e2e (Task 8) → §9. Anti-overfitting → constants are corpus-agnostic (Task 3), validated on diverse data in manual step. ✅
- **Placeholder scan:** No TBD/TODO. The one simplification (`fitsWithinBudget` room-at-cap) is explicitly labeled in code comments and the file table, not hidden. ✅
- **Type consistency:** `CoveragePlanItem`/`CoverageMap`/`Planner`/`Reviser` defined once (Task 1) and imported everywhere; `runCoverageLoop` returns `LoopResult` whose `{draft, verification, coverageMap, rounds, improvementSuggestions}` exactly match the fields persisted in Task 8 and the schema/validators in Task 7; `SuggestionReason` literals (`unsupportable`/`budget`/`gate-rejected`) match the `v.union(v.literal(...))` in Task 7; `hardGatesPass` defined in Task 5 and reused by both `buildQualityVerdict` and `runCoverageLoop`; `diffCoverage`/`draftText`/`fitsWithinBudget`/`nextLoopState` signatures match their call sites in Task 5. ✅
- **Scope:** One subsystem (the coverage loop + a budget stub). Each task ships a tested, committable unit; pure logic is isolated from LLM/Convex I/O. ✅
```
