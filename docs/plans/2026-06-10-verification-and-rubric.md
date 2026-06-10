# Independent Verification & Rubric Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generator's self-reported fit score with an independent, cross-vendor verification pass plus a deterministic rubric, producing a hard-gated quality verdict for every Fitting.

**Architecture:** Two complementary scorers feed one combiner. (1) A pure, LLM-free **rubric** scores the mechanical rules from `resume-quality-standard.md` (metric density, bullet caps, banned openers, lengths) — fully unit-testable. (2) An **independent Verifier** (a separate LLM pass, defaulting to a *different vendor* than the generator) adjudicates the three hard gates from the doctrine spec — truthfulness, fidelity, consistency — and grades coverage + transferability. A pure `buildQualityVerdict` combiner merges both into the `fit` result and a `gatePass` decision, which `generateFitting` persists. This implements §7 (verification gate) of the design spec; it does not yet implement the §16 coverage *revise* loop (a follow-on).

**Tech Stack:** Convex (TS functions, document DB), `@google/genai` + `@anthropic-ai/sdk` via the existing `convex/llm` factory, Vitest + convex-test.

**Source of truth:**
- Doctrine + gate/rubric definitions: `docs/research/2026-06-09-resume-quality.md` (relocated into the repo in Task 1).
- Numeric mechanical rules: `docs/research/2026-06-09-resume-quality-standard.md`.

---

## File Structure

| File | Responsibility | LLM? | Unit-tested? |
|---|---|---|---|
| `convex/quality/rubric.ts` | Pure deterministic scorer over a résumé (metric density, caps, banned openers, lengths) → `DeterministicReport`. | No | Yes (Tasks 2–3) |
| `convex/quality/rubric.test.ts` | Unit tests for rubric. | — | — |
| `convex/quality/score.ts` | Pure combiner: `(DeterministicReport, VerificationReport) → QualityVerdict`. Owns hard-gate logic + composite fit math. | No | Yes (Task 6) |
| `convex/quality/score.test.ts` | Unit tests for the combiner. | — | — |
| `convex/llm/types.ts` | Add `Verifier` interface, verification types, `VERIFICATION_SYSTEM` prompt. | — | — |
| `convex/llm/verifier-select.ts` | Pure `pickVerifierProvider(genProvider, env)` — vendor-independence + key-availability fallback. | No | Yes (Task 4) |
| `convex/llm/verifier-select.test.ts` | Unit tests for provider selection. | — | — |
| `convex/llm/gemini.ts` / `anthropic.ts` | Add `GeminiVerifier` / `ClaudeVerifier`. | Yes | No (integration) |
| `convex/llm/index.ts` | Add `getVerifier()` using `pickVerifierProvider`. | — | No |
| `convex/schema.ts` | Extend `fittings` with optional `verification` + `gate` fields. | — | — |
| `convex/fittings.ts` | Extend `saveFitting` validators; expose new fields in `getFitting`. | — | — |
| `convex/generate.ts` | Orchestrate: generate → verify → rubric → combine → persist. | — | No (manual verify) |

---

## Task 1: Relocate the doctrine spec into the repo

The verification gate definitions live in a spec that was written outside the git repo. Move it in so the plan and code reference an in-repo, version-controlled source of truth, and cross-link the two quality docs.

**Files:**
- Create: `tailor/docs/research/2026-06-09-resume-quality.md` (moved from repo-parent `docs/research/`)
- Modify: `tailor/docs/research/2026-06-09-resume-quality-standard.md:5` (add cross-link)

- [ ] **Step 1: Move the spec into the repo**

Run from the `tailor/` directory:
```bash
git mv ../docs/research/2026-06-09-resume-quality.md docs/research/2026-06-09-resume-quality.md \
  2>/dev/null || mv "../docs/research/2026-06-09-resume-quality.md" docs/research/2026-06-09-resume-quality.md
```
(The parent `docs/` is outside the repo, so `git mv` won't track the source; the `||` branch does a plain move. Remove the now-empty parent `docs/research/` if desired.)

- [ ] **Step 2: Cross-link the two docs**

In `docs/research/2026-06-09-resume-quality-standard.md`, immediately after the line ending `…§17 (selection/ranking), and the generation prompt (§18).` (line ~5), add:

```markdown
>
> **Companion doc:** `2026-06-09-resume-quality.md` defines the *doctrine* (moat/mission/ICP) and the **verification gates + rubric** (truthfulness, fidelity, consistency) that adjudicate output quality. This standard supplies the *numeric content rules*; that doc supplies the *gate definitions*. Both are enforced by the verification pass in `docs/plans/2026-06-10-verification-and-rubric.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/research/2026-06-09-resume-quality.md docs/research/2026-06-09-resume-quality-standard.md
git commit -m "docs: relocate resume-quality doctrine spec into repo, cross-link standard"
```

---

## Task 2: Deterministic rubric — metric density, lengths, banned openers

Build the pure scorer's first half: the per-bullet checks. No LLM, no Convex runtime — plain TS so it unit-tests under Vitest.

**Files:**
- Create: `convex/quality/rubric.ts`
- Test: `convex/quality/rubric.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quality/rubric.test.ts`
Expected: FAIL — `Cannot find module './rubric'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/quality/rubric.ts
// Pure, LLM-free scorer for the mechanical rules in
// docs/research/2026-06-09-resume-quality-standard.md. No Convex/node imports
// so it runs under plain Vitest.

export interface ScorableResume {
  summary: string;
  experiences: { highlights: { text: string }[] }[];
  skills: string[];
}

const BANNED_OPENERS = [
  "Responsible for",
  "Duties included",
  "Helped",
  "Assisted",
  "Worked on",
  "Participated in",
  "Handled",
];

export function allBullets(r: ScorableResume): string[] {
  return r.experiences.flatMap((e) => e.highlights.map((h) => h.text));
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** A bullet "carries a measure" if it contains a digit, %, or $. */
export function metricDensity(r: ScorableResume): number {
  const bullets = allBullets(r);
  if (bullets.length === 0) return 0;
  const withMetric = bullets.filter((b) => /[0-9%$]/.test(b)).length;
  return withMetric / bullets.length;
}

export function bannedOpenerHits(r: ScorableResume): string[] {
  return allBullets(r).filter((b) => {
    const lc = b.trimStart().toLowerCase();
    return BANNED_OPENERS.some((opener) => lc.startsWith(opener.toLowerCase()));
  });
}

export function longBulletHits(r: ScorableResume): string[] {
  return allBullets(r).filter((b) => wordCount(b) > 25);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/quality/rubric.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/rubric.ts convex/quality/rubric.test.ts
git commit -m "feat(quality): per-bullet rubric checks (metric density, banned openers, length)"
```

---

## Task 3: Deterministic rubric — caps, summary, skills, composite score

Add the résumé-level checks and the composite `scoreDeterministic` that returns the full `DeterministicReport`.

**Files:**
- Modify: `convex/quality/rubric.ts`
- Test: `convex/quality/rubric.test.ts`

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to convex/quality/rubric.test.ts
import { scoreDeterministic } from "./rubric";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quality/rubric.test.ts`
Expected: FAIL — `scoreDeterministic is not a function`.

- [ ] **Step 3: Write minimal implementation (append to rubric.ts)**

```ts
// append to convex/quality/rubric.ts
export interface DeterministicReport {
  metricDensity: number; // 0..1
  totalBullets: number;
  bulletCapOk: boolean; // total <= 18
  perRoleOverCap: number; // # of roles with > 6 bullets
  bannedOpenerHits: string[];
  longBulletHits: string[];
  summaryWords: number;
  summaryWordsOk: boolean; // 40..60
  skillsCount: number;
  skillsCountOk: boolean; // 8..20
  score: number; // 0..100
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function scoreDeterministic(r: ScorableResume): DeterministicReport {
  const bullets = allBullets(r);
  const density = metricDensity(r);
  const banned = bannedOpenerHits(r);
  const long = longBulletHits(r);
  const summaryWords = r.summary.trim() ? r.summary.trim().split(/\s+/).length : 0;
  const summaryWordsOk = summaryWords >= 40 && summaryWords <= 60;
  const skillsCount = r.skills.length;
  const skillsCountOk = skillsCount >= 8 && skillsCount <= 20;
  const perRoleOverCap = r.experiences.filter((e) => e.highlights.length > 6).length;
  const bulletCapOk = bullets.length <= 18;

  let score = 100;
  if (density < 0.8) score -= Math.round((0.8 - density) * 50); // up to -40
  score -= Math.min(banned.length * 10, 30);
  score -= Math.min(long.length * 3, 15);
  if (!summaryWordsOk) score -= 10;
  if (!skillsCountOk) score -= 10;
  if (!bulletCapOk) score -= 10;
  score -= Math.min(perRoleOverCap * 5, 15);

  return {
    metricDensity: density,
    totalBullets: bullets.length,
    bulletCapOk,
    perRoleOverCap,
    bannedOpenerHits: banned,
    longBulletHits: long,
    summaryWords,
    summaryWordsOk,
    skillsCount,
    skillsCountOk,
    score: clamp(score, 0, 100),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/quality/rubric.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/rubric.ts convex/quality/rubric.test.ts
git commit -m "feat(quality): composite deterministic rubric score + report"
```

---

## Task 4: Verifier types + vendor-independence selection

Define the verification contract and the pure provider-selection rule: the verifier defaults to a *different* vendor than the generator (independence), falling back to the generator's vendor only when the other vendor's key is absent.

**Files:**
- Modify: `convex/llm/types.ts` (append types + prompt)
- Create: `convex/llm/verifier-select.ts`
- Test: `convex/llm/verifier-select.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// convex/llm/verifier-select.test.ts
import { describe, it, expect } from "vitest";
import { pickVerifierProvider } from "./verifier-select";

describe("pickVerifierProvider", () => {
  const bothKeys = { GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" };

  it("defaults to the OTHER vendor for independence", () => {
    expect(pickVerifierProvider("gemini", bothKeys)).toBe("anthropic");
    expect(pickVerifierProvider("anthropic", bothKeys)).toBe("gemini");
  });

  it("honors an explicit VERIFIER_PROVIDER override", () => {
    expect(pickVerifierProvider("gemini", { ...bothKeys, VERIFIER_PROVIDER: "gemini" })).toBe("gemini");
  });

  it("falls back to the generator vendor when the other vendor's key is missing", () => {
    expect(pickVerifierProvider("gemini", { GEMINI_API_KEY: "g" })).toBe("gemini");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/llm/verifier-select.test.ts`
Expected: FAIL — `Cannot find module './verifier-select'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/llm/verifier-select.ts
// Pure provider-selection for the independent verifier. No node/SDK imports.
export type Provider = "gemini" | "anthropic";

export function pickVerifierProvider(
  genProvider: string,
  env: Record<string, string | undefined>,
): Provider {
  const explicit = env.VERIFIER_PROVIDER?.toLowerCase();
  if (explicit === "gemini" || explicit === "anthropic") return explicit;

  const gen: Provider = genProvider === "anthropic" ? "anthropic" : "gemini";
  const want: Provider = gen === "anthropic" ? "gemini" : "anthropic";
  const keyFor = (p: Provider) => (p === "anthropic" ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY);
  return keyFor(want) ? want : gen; // independence needs the other vendor's key
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/llm/verifier-select.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Append verification types + prompt to `convex/llm/types.ts`**

```ts
// append to convex/llm/types.ts

// ---- Verification (independent pass; §7 verification gate) ----
export interface BulletVerdict {
  text: string;
  defensible: boolean; // grounded in profile evidence or a defensible entailment
  evidence?: string; // the profile fact/bullet that supports it
  reason?: string; // if not defensible, why
}
export interface VerificationReport {
  bulletVerdicts: BulletVerdict[];
  truthfulnessPass: boolean; // every bullet defensible
  fidelityPass: boolean; // dates/titles/employers/metrics match the profile
  fidelityIssues: string[];
  consistencyPass: boolean; // no internal contradictions, agrees with the profile
  consistencyIssues: string[];
  coverageScore: number; // 0..100 — corpus-defensible JD requirements surfaced
  transferabilityScore: number; // 0..100 — off-domain evidence reframed truthfully
}

/** A separate pass (ideally a different vendor than the Generator) that adjudicates a generated résumé. */
export interface Verifier {
  verify(
    jobText: string,
    profile: CanonicalProfile,
    resume: GeneratedResume,
  ): Promise<VerificationReport>;
}

export const VERIFICATION_SYSTEM =
  "You are TAILOR's independent résumé VERIFIER. You did NOT write this résumé. Input: a job description, " +
  "the candidate's canonical PROFILE (ground truth), and a generated RÉSUMÉ. Adjudicate the résumé against the " +
  "profile ONLY. Be skeptical — your job is to catch fabrication, not to praise.\n" +
  "HARD GATES:\n" +
  "(1) TRUTHFULNESS — for EACH résumé highlight, decide if it is defensible: directly stated in the profile OR a " +
  "defensible entailment of profile evidence (e.g. 'used Tableau' entails 'data visualization'). A highlight that " +
  "adds an employer, title, metric, or skill NOT supported by the profile is NOT defensible. Return a verdict per bullet.\n" +
  "(2) FIDELITY — every company, position, date, and metric must match the profile. List any mismatch.\n" +
  "(3) CONSISTENCY — no internal contradictions (overlapping dates, conflicting claims) and nothing that contradicts " +
  "the profile. List any issue.\n" +
  "GRADED: coverageScore 0–100 = how well the résumé surfaces the candidate's strongest profile evidence for the JD's " +
  "requirements (penalize defensible evidence left out; do NOT reward covering a requirement with a fabrication). " +
  "transferabilityScore 0–100 = for off-domain JDs, how legibly transferable evidence is reframed WITHOUT overreaching.\n" +
  "truthfulnessPass = every bullet defensible. fidelityPass = no mismatches. consistencyPass = no issues.\n" +
  'Return ONLY JSON: {"bulletVerdicts":[{"text","defensible","evidence","reason"}],"truthfulnessPass":bool,' +
  '"fidelityPass":bool,"fidelityIssues":[string],"consistencyPass":bool,"consistencyIssues":[string],' +
  '"coverageScore":number,"transferabilityScore":number}.';
```

- [ ] **Step 6: Commit**

```bash
git add convex/llm/verifier-select.ts convex/llm/verifier-select.test.ts convex/llm/types.ts
git commit -m "feat(quality): verifier contract, verification prompt, vendor-independent selection"
```

---

## Task 5: Provider verifier implementations + `getVerifier()`

Add `GeminiVerifier` and `ClaudeVerifier` that call their model with `VERIFICATION_SYSTEM`, and wire `getVerifier()` through `pickVerifierProvider`. These call live LLMs, so they are validated by manual run + the eval fixture (Task 9), not unit tests.

**Files:**
- Modify: `convex/llm/gemini.ts`, `convex/llm/anthropic.ts`, `convex/llm/index.ts`

- [ ] **Step 1: Add `GeminiVerifier` to `convex/llm/gemini.ts`**

Add the import and class (the `jsonCall` helper already exists in this file):

```ts
// add Verifier, VerificationReport, VERIFICATION_SYSTEM, GeneratedResume to the existing import from "./types"
import {
  GENERATION_SYSTEM,
  PROFILE_SYSTEM,
  VERIFICATION_SYSTEM,
  type CanonicalProfile,
  type GeneratedResume,
  type Generator,
  type ProfileBuilder,
  type Verifier,
  type VerificationReport,
} from "./types";

export class GeminiVerifier implements Verifier {
  async verify(
    jobText: string,
    profile: CanonicalProfile,
    resume: GeneratedResume,
  ): Promise<VerificationReport> {
    return (await jsonCall(
      VERIFICATION_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, resume }),
    )) as VerificationReport;
  }
}
```

- [ ] **Step 2: Add `ClaudeVerifier` to `convex/llm/anthropic.ts`**

Mirror the existing `ClaudeGenerator` pattern in that file (reuse its JSON-call helper / client). Add to the import from `./types`: `VERIFICATION_SYSTEM`, `type Verifier`, `type VerificationReport`, `type GeneratedResume`. Then:

```ts
export class ClaudeVerifier implements Verifier {
  async verify(
    jobText: string,
    profile: CanonicalProfile,
    resume: GeneratedResume,
  ): Promise<VerificationReport> {
    // Use the same JSON-mode call this file already uses for ClaudeGenerator,
    // passing VERIFICATION_SYSTEM as the system prompt and
    // JSON.stringify({ jobDescription: jobText, profile, resume }) as the user content.
    return (await this.jsonCall(
      VERIFICATION_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, resume }),
    )) as VerificationReport;
  }
}
```

> Note for the implementer: open `convex/llm/anthropic.ts` and match its actual JSON-call shape (it may be a free function rather than a method). The contract is identical to Gemini's: system = `VERIFICATION_SYSTEM`, user = the stringified `{ jobDescription, profile, resume }`, response parsed as JSON into `VerificationReport`.

- [ ] **Step 3: Add `getVerifier()` to `convex/llm/index.ts`**

```ts
// add to convex/llm/index.ts
import type { Generator, ProfileBuilder, Verifier } from "./types";
import { GeminiGenerator, GeminiProfileBuilder, GeminiVerifier } from "./gemini";
import { ClaudeGenerator, ClaudeProfileBuilder, ClaudeVerifier } from "./anthropic";
import { pickVerifierProvider } from "./verifier-select";

export function getVerifier(): Verifier {
  const chosen = pickVerifierProvider(provider(), process.env);
  return chosen === "anthropic" ? new ClaudeVerifier() : new GeminiVerifier();
}
```

(Keep the existing `provider()`, `getProfileBuilder`, `getGenerator`, and `export * from "./types"`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: no errors. Fix any import mismatches in `anthropic.ts` until clean.

- [ ] **Step 5: Commit**

```bash
git add convex/llm/gemini.ts convex/llm/anthropic.ts convex/llm/index.ts
git commit -m "feat(quality): Gemini/Claude verifier impls + getVerifier() factory"
```

---

## Task 6: Quality verdict combiner (hard gates + composite fit)

Pure function merging the deterministic report and the verification report into the persisted `QualityVerdict`: the three hard gates, blocking reasons, and the composite `fit`. A hard-gate failure flips `gatePass=false` (the gen is not shippable; it routes back to the §16 loop once that exists).

**Files:**
- Create: `convex/quality/score.ts`
- Test: `convex/quality/score.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/quality/score.test.ts`
Expected: FAIL — `Cannot find module './score'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// convex/quality/score.ts
// Pure combiner: deterministic rubric + independent verification → persisted verdict.
import type { DeterministicReport } from "./rubric";
import type { VerificationReport } from "../llm/types";

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
  const gatePass = gates.truthfulness && gates.fidelity && gates.consistency;

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/quality/score.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/score.ts convex/quality/score.test.ts
git commit -m "feat(quality): combine rubric + verification into gated quality verdict"
```

---

## Task 7: Schema + `saveFitting` — persist the verification verdict

Extend the `fittings` table to store the gate result, blocking reasons, per-bullet verdicts, and the new `fit` sub-scores. New fields are **optional** so existing rows remain valid.

**Files:**
- Modify: `convex/schema.ts:81-87` (the `fit` object + new `gate`/`verification` fields)
- Modify: `convex/fittings.ts:19-36` (`saveFitting` args) and `:57-75` (`getFitting` return)

- [ ] **Step 1: Extend the schema**

In `convex/schema.ts`, replace the `fit` field inside `fittings` (currently lines ~81–86) with:

```ts
    fit: v.object({
      overall: v.number(),
      keyword: v.number(),
      requirement: v.number(),
      format: v.number(),
      coverage: v.optional(v.number()),
      quality: v.optional(v.number()),
      transferability: v.optional(v.number()),
    }),
    gate: v.optional(
      v.object({
        pass: v.boolean(),
        truthfulness: v.boolean(),
        fidelity: v.boolean(),
        consistency: v.boolean(),
        blockingReasons: v.array(v.string()),
      }),
    ),
    bulletVerdicts: v.optional(
      v.array(
        v.object({
          text: v.string(),
          defensible: v.boolean(),
          evidence: v.optional(v.string()),
          reason: v.optional(v.string()),
        }),
      ),
    ),
```

- [ ] **Step 2: Extend `saveFitting` validators in `convex/fittings.ts`**

Update the `fit` validator in `saveFitting.args` to match the schema (add the three optional numbers), and add `gate` + `bulletVerdicts` optional args mirroring the schema objects above. The handler stays `ctx.db.insert("fittings", args)`.

- [ ] **Step 3: Expose new fields in `getFitting`**

In the `getFitting` return object (`convex/fittings.ts:62-73`), add: `gate: f.gate ?? null,` and `bulletVerdicts: f.bulletVerdicts ?? [],`.

- [ ] **Step 4: Typecheck + push schema (dev)**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: clean.
Then (with `npm run dev:backend` running, or once): `npx convex dev --once`
Expected: schema deploys without validator errors. If old `fittings` rows block the optional-field migration, clear them in the Convex dashboard (dev data only).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/fittings.ts
git commit -m "feat(quality): persist gate verdict + bullet verdicts + fit sub-scores on fittings"
```

---

## Task 8: Wire verification into `generateFitting`

Replace the self-reported fit math with: run the independent verifier, run the deterministic rubric, combine, and persist the verdict. Keep `keyword`/`requirement`/`format` for backward compatibility but source `overall` and the gate from the verdict.

**Files:**
- Modify: `convex/generate.ts:51-95`

- [ ] **Step 1: Add imports and the verify+score block**

At the top of `convex/generate.ts`, extend the llm import and add the quality imports:

```ts
import { getGenerator, getVerifier } from "./llm";
import type { CanonicalProfile } from "./llm";
import { scoreDeterministic, type ScorableResume } from "./quality/rubric";
import { buildQualityVerdict } from "./quality/score";
```

- [ ] **Step 2: Replace the fit computation (current lines ~70–95)**

After `const experiences = … ` and `const skills = …` are built (keep those as-is), replace the keyword/requirement/format/overall block and the `saveFitting` call with:

```ts
    // Independent verification (separate pass, ideally a different vendor).
    const verification = await getVerifier().verify(rawText, canonical, gen);

    // Deterministic rubric over the cleaned résumé.
    const scorable: ScorableResume = {
      summary: gen.summary ?? "",
      experiences: experiences.map((e) => ({ highlights: e.highlights.map((h) => ({ text: h.text })) })),
      skills,
    };
    const deterministic = scoreDeterministic(scorable);
    const verdict = buildQualityVerdict(deterministic, verification);

    // Legacy sub-scores retained for the existing UI.
    const keywords = (gen.keywords ?? []).filter((k) => typeof k === "string" && k.trim());
    const reqs = (gen.requirements ?? []).filter((r) => r && typeof r.text === "string" && r.text.trim());
    const requirement = reqs.length
      ? Math.round((reqs.filter((r) => r.covered).length / reqs.length) * 100)
      : 0;
    const allText = (
      gen.summary + " " +
      experiences.flatMap((e) => e.highlights.map((h) => h.text)).join(" ") + " " +
      skills.join(" ")
    ).toLowerCase();
    const kwHits = keywords.filter((k) => allText.includes(k.toLowerCase())).length;
    const keyword = keywords.length ? Math.round((kwHits / keywords.length) * 100) : 0;

    const fittingId = await ctx.runMutation(internal.fittings.saveFitting, {
      jobId,
      template: template === "compact" ? "compact" : "classic",
      summary: gen.summary ?? "",
      experiences,
      skills,
      keywords,
      requirements: reqs.map((r) => ({ text: r.text, covered: !!r.covered })),
      fit: {
        overall: verdict.fit.overall,
        keyword,
        requirement,
        format: deterministic.score, // rubric score replaces the hardcoded 96
        coverage: verdict.fit.coverage,
        quality: verdict.fit.quality,
        transferability: verdict.fit.transferability,
      },
      gate: {
        pass: verdict.gatePass,
        truthfulness: verdict.gates.truthfulness,
        fidelity: verdict.gates.fidelity,
        consistency: verdict.gates.consistency,
        blockingReasons: verdict.blockingReasons,
      },
      bulletVerdicts: verification.bulletVerdicts,
    });
    return { fittingId: fittingId as string };
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p convex/tsconfig.json --noEmit`
Expected: clean.

- [ ] **Step 4: Manual end-to-end verification**

With `npm run dev` + `npm run dev:backend` running and a profile already built, generate a Fitting from the UI (or call the action). Confirm in the Convex dashboard that the new `fitting` row has: a `gate` object, `bulletVerdicts` with per-bullet `defensible` flags, and `fit.coverage/quality/transferability` populated. Then **adversarially test the gate**: temporarily edit the profile to remove a metric a bullet relies on, regenerate, and confirm `gate.pass` flips to `false` with a matching `blockingReasons` entry. (Requires `ANTHROPIC_API_KEY` set on the deployment for cross-vendor independence; otherwise the verifier falls back to the generator's vendor — see Task 4.)

- [ ] **Step 5: Commit**

```bash
git add convex/generate.ts
git commit -m "feat(quality): gate generated fittings with independent verification + rubric"
```

---

## Task 9: Eval fixture — gate catches a planted fabrication

A lightweight, deterministic guard that the *combiner + report shapes* behave end-to-end without a live LLM: feed a hand-authored `VerificationReport` containing a planted fabrication through the real combiner and assert the gate blocks it. (Live-LLM accuracy is validated by the synthetic fixtures in the broader eval harness, per the doctrine spec §7 — out of scope here.)

**Files:**
- Create: `convex/quality/gate.fixture.test.ts`

- [ ] **Step 1: Write the test**

```ts
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
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — all rubric, score, verifier-select, fixture, and pre-existing tests green.

- [ ] **Step 3: Commit**

```bash
git add convex/quality/gate.fixture.test.ts
git commit -m "test(quality): gate blocks a clean résumé hiding a planted fabrication"
```

---

## Out of scope (follow-on plans)

- **§16 coverage *revise* loop** — this plan *gates* (pass/fail + reasons) but does not yet feed failures back into a bounded `plan→generate→coverage-diff→revise→fixed-point` loop. Next plan.
- **§17 selection-under-budget** — submodular/knapsack bullet selection; the rubric currently *scores* caps but does not *enforce* selection.
- **Profile (Form) quality scoring** — the doctrine spec's Part A (canonicalization recall/dedup/fidelity). This plan covers Part B (tailored output).
- **Synthetic eval harness** — diverse fixtures with authored ground-truth labels for live-LLM verifier accuracy + regression gating.
- **UI surfacing** — showing the gate + blocking reasons + bullet verdicts in the Fitting Room.

---

## Self-Review

- **Spec coverage (doctrine §6 gates + §7 methodology):** Truthfulness/Fidelity/Consistency hard gates → Tasks 4–6 (types, verifier, combiner). Graded coverage + transferability → verification report (Task 4) + combiner (Task 6). Deterministic rubric (metric density, caps, banned openers, lengths from the standard doc) → Tasks 2–3. Independent, different-vendor verifier (§7) → Task 4 selection + Task 5 impls. Persist + gate → Tasks 7–8. Honest-gap behavior is preserved (the verifier penalizes uncovered defensible evidence but never rewards fabricated coverage — encoded in `VERIFICATION_SYSTEM`). Anti-overfitting (§8) and the Form/Part-A scorer are correctly deferred to follow-ons. ✅
- **Placeholder scan:** No TBD/TODO. The one soft spot — `ClaudeVerifier`'s JSON-call shape — is explicitly flagged for the implementer to match `anthropic.ts`'s existing helper, with the exact contract (system/user/parse) spelled out. ✅
- **Type consistency:** `ScorableResume`, `DeterministicReport` (rubric.ts) and `VerificationReport`, `BulletVerdict`, `Verifier` (llm/types.ts) are defined once and imported everywhere; `buildQualityVerdict(det, ver)` signature matches its callers in Task 8 and tests in Task 6/9; `fit` object fields match across schema (Task 7), `saveFitting` (Task 7), and `generateFitting` (Task 8). ✅
- **Scope:** One subsystem (output-quality verification gate). Cohesive; each task ships a tested, committable unit. ✅
