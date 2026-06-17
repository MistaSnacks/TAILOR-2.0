# TAILOR Phase A — Entailment-Grounded Ceiling Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TAILOR's generation reach the corpus-defensible ceiling — surface moderate entailments, and repair gate violations instead of bailing at `rounds:0` and shipping a gate-failed draft.

**Architecture:** Upgrade the existing §16 coverage loop in place. Add a pure `gateRepairTargets()` extractor, a bounded gate-repair sub-loop in `runCoverageLoop` that revises a failing draft toward the gate (new Reviser `"repair"` mode + `REPAIR_SYSTEM` prompt), a `status: "ready" | "not-ready"` outcome, and strengthen the planner/verifier/generation prompts for moderate role/activity entailment + a summary overclaim guard. Persist `status` on the fitting.

**Tech Stack:** TypeScript, Convex (document DB + actions), Vitest. LLM roles are dependency-injected interfaces (`convex/llm/types.ts`), so loop logic unit-tests with scripted stubs.

**Spec:** `docs/specs/2026-06-16-tailor-ceiling-and-ats-design.md` (Phase A). Phases B (scoring/UI) and C (ATS layer) get their own plans once these interfaces land.

---

## File Structure

- **Modify** `convex/quality/loop.ts` — add `gateRepairTargets()`; add gate-repair sub-loop + `status` to `runCoverageLoop`; `maxRepairs` dep; `status` on `LoopResult`.
- **Modify** `convex/quality/loop.test.ts` — tests for `gateRepairTargets` and the gate-repair/status behavior.
- **Modify** `convex/llm/types.ts` — add `REPAIR_SYSTEM`; extend `Reviser.revise` with optional `mode`; strengthen `PLANNER_SYSTEM`, `VERIFICATION_SYSTEM`, `GENERATION_SYSTEM`.
- **Modify** `convex/llm/anthropic.ts` — `ClaudeReviser` honors `mode`.
- **Modify** `convex/llm/gemini.ts` — `GeminiReviser` honors `mode`.
- **Modify** `convex/schema.ts` — `fittings.status` optional field.
- **Modify** `convex/fittings.ts` — `saveFitting` accepts `status`; `getFitting` returns it.
- **Modify** `convex/generate.ts` — pass `loop.status` to `saveFitting`.

Commands used throughout:
- Typecheck: `npx tsc --noEmit -p tsconfig.json` (expect exit 0)
- One test file: `npx vitest run convex/quality/loop.test.ts`
- Full suite: `npx vitest run`

---

### Task 1: `gateRepairTargets()` — pure extractor of repair targets from a failing verification

**Files:**
- Modify: `convex/quality/loop.ts`
- Test: `convex/quality/loop.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `convex/quality/loop.test.ts`. Update the import on line 3 to include `gateRepairTargets`:

```ts
import { nextLoopState, runCoverageLoop, gateRepairTargets } from "./loop";
```

Then append this block after the `nextLoopState` describe block:

```ts
describe("gateRepairTargets", () => {
  it("collects undefensible bullets (with reason), fidelity and consistency issues", () => {
    const ver: VerificationReport = {
      bulletVerdicts: [
        { text: "Led a $50M deal", defensible: false, reason: "no such metric in profile" },
        { text: "Cut latency 40%", defensible: true },
      ],
      truthfulnessPass: false,
      fidelityPass: false, fidelityIssues: ["title 'VP' not in profile"],
      consistencyPass: false, consistencyIssues: ["dates overlap TD Bank / Possible Finance"],
      coverageScore: 0, transferabilityScore: 0,
    };
    expect(gateRepairTargets(ver)).toEqual([
      "Led a $50M deal — no such metric in profile",
      "title 'VP' not in profile",
      "dates overlap TD Bank / Possible Finance",
    ]);
  });

  it("labels an undefensible bullet with no reason generically", () => {
    const ver: VerificationReport = {
      bulletVerdicts: [{ text: "Owned the roadmap", defensible: false }],
      truthfulnessPass: false,
      fidelityPass: true, fidelityIssues: [],
      consistencyPass: true, consistencyIssues: [],
      coverageScore: 0, transferabilityScore: 0,
    };
    expect(gateRepairTargets(ver)).toEqual(["Undefensible: Owned the roadmap"]);
  });

  it("returns [] when nothing is wrong", () => {
    expect(gateRepairTargets(PASS)).toEqual([]);
  });
});
```

(`PASS` and the `VerificationReport` type are already defined/imported in this file.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/quality/loop.test.ts`
Expected: FAIL — `gateRepairTargets is not a function` / not exported.

- [ ] **Step 3: Implement `gateRepairTargets`**

In `convex/quality/loop.ts`, add this exported function immediately after the imports block (after the `import { hardGatesPass } from "./score";` line, before `export type SuggestionReason`):

```ts
/**
 * Turn a FAILING verification into concrete repair targets for the reviser:
 * undefensible bullets (with the verifier's reason), fidelity issues, consistency issues.
 * Returns [] for a passing report.
 */
export function gateRepairTargets(ver: VerificationReport): string[] {
  const targets: string[] = [];
  for (const b of ver.bulletVerdicts) {
    if (!b.defensible) targets.push(b.reason ? `${b.text} — ${b.reason}` : `Undefensible: ${b.text}`);
  }
  targets.push(...ver.fidelityIssues, ...ver.consistencyIssues);
  return targets;
}
```

(`VerificationReport` is already imported in `loop.ts` at the top type-import block.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run convex/quality/loop.test.ts`
Expected: PASS (the three new `gateRepairTargets` tests + all existing loop tests).

- [ ] **Step 5: Commit**

```bash
git add convex/quality/loop.ts convex/quality/loop.test.ts
git commit -m "feat(loop): gateRepairTargets — extract repair targets from a failing verification"
```

---

### Task 2: Reviser `"repair"` mode + `REPAIR_SYSTEM` prompt (both providers)

**Files:**
- Modify: `convex/llm/types.ts`
- Modify: `convex/llm/anthropic.ts`
- Modify: `convex/llm/gemini.ts`

This task is interface + prompt wiring; it is verified by typecheck (its behavior is exercised by the stub-driven loop tests in Task 3).

- [ ] **Step 1: Extend the `Reviser` interface**

In `convex/llm/types.ts`, replace the `Reviser` interface (currently ending `targets: string[],) => Promise<GeneratedResume>`) with:

```ts
/** Constrained re-generate. mode "coverage": surface evidence for gap targets. mode "repair": fix gate-violation targets. Changes nothing else. */
export interface Reviser {
  revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
    mode?: "coverage" | "repair",
  ): Promise<GeneratedResume>;
}
```

- [ ] **Step 2: Add the `REPAIR_SYSTEM` prompt**

In `convex/llm/types.ts`, immediately after the `REVISE_SYSTEM` constant, add:

```ts
export const REPAIR_SYSTEM =
  "You are TAILOR's résumé REPAIRER. Input: a job description, the candidate's canonical PROFILE, an existing " +
  "résumé DRAFT that FAILED verification, and a list of ISSUES (gate violations) to fix. Fix ONLY those issues, using " +
  "ONLY facts in the profile. Typical fixes: an OVERCLAIM in the summary (e.g. claiming total years in a specific " +
  "domain when only some roles are in that domain — state the honest split, e.g. '8+ years in operations & fraud, " +
  "~3 in credit/FinTech'); a metric/title/employer/date that does not match the profile; or an internal contradiction. " +
  "Make the SMALLEST change that resolves each issue; keep every other bullet, the employers, positions, and dates " +
  "exactly as in the draft. NEVER fabricate to satisfy an issue. Obey the same grounding and bullet-quality rules as " +
  "generation. Return the SAME résumé JSON shape as the draft: " +
  '{"summary":string,"experiences":[{"company","position","startDate","endDate","highlights":[{"text","type","relationship"}]}],"skills":[string],"requirements":[{"text","covered"}],"keywords":[string]}.';
```

- [ ] **Step 3: Honor `mode` in `ClaudeReviser`**

In `convex/llm/anthropic.ts`, add `REPAIR_SYSTEM` to the import list from `./types`, then replace the `ClaudeReviser` class with:

```ts
export class ClaudeReviser implements Reviser {
  async revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
    mode: "coverage" | "repair" = "coverage",
  ): Promise<GeneratedResume> {
    const system = mode === "repair" ? REPAIR_SYSTEM : REVISE_SYSTEM;
    const payload = mode === "repair"
      ? { jobDescription: jobText, profile, draft, issues: targets }
      : { jobDescription: jobText, profile, draft, targets };
    return (await call(system, JSON.stringify(payload))) as GeneratedResume;
  }
}
```

- [ ] **Step 4: Honor `mode` in `GeminiReviser`**

In `convex/llm/gemini.ts`, add `REPAIR_SYSTEM` to the import list from `./types`, then replace the `GeminiReviser` class with:

```ts
export class GeminiReviser implements Reviser {
  async revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
    mode: "coverage" | "repair" = "coverage",
  ): Promise<GeneratedResume> {
    const system = mode === "repair" ? REPAIR_SYSTEM : REVISE_SYSTEM;
    const payload = mode === "repair"
      ? { jobDescription: jobText, profile, draft, issues: targets }
      : { jobDescription: jobText, profile, draft, targets };
    return (await jsonCall(system, JSON.stringify(payload))) as GeneratedResume;
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0 (the optional `mode` param keeps existing call sites valid).

- [ ] **Step 6: Commit**

```bash
git add convex/llm/types.ts convex/llm/anthropic.ts convex/llm/gemini.ts
git commit -m "feat(llm): Reviser repair mode + REPAIR_SYSTEM prompt"
```

---

### Task 3: Gate-repair sub-loop + `status` in `runCoverageLoop`

**Files:**
- Modify: `convex/quality/loop.ts`
- Test: `convex/quality/loop.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `runCoverageLoop` describe block in `convex/quality/loop.test.ts`:

```ts
  it("repairs a gate-failing base draft and proceeds (status ready)", async () => {
    const failing = bulletDraft(["Led a fabricated $50M deal"]);
    const clean = bulletDraft(["Led a major enterprise deal"]);
    // FAIL only while the draft still contains the sentinel; supply a repair target.
    const repairVerifier: Verifier = {
      verify: async (_j, _p, r) =>
        JSON.stringify(r).includes("fabricated")
          ? { ...FAIL, bulletVerdicts: [{ text: "Led a fabricated $50M deal", defensible: false, reason: "metric not in profile" }] }
          : PASS,
    };
    const reviser: Reviser = { revise: async (_j, _p, _d, _t, mode) => (mode === "repair" ? clean : clean) };
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner([]), generator: generator(failing), reviser, verifier: repairVerifier,
    });
    expect(res.status).toBe("ready");
    expect(draftTextHas(res.draft, "fabricated")).toBe(false);
  });

  it("marks not-ready when the base draft cannot be repaired within budget", async () => {
    const failing = bulletDraft(["Led a fabricated $50M deal"]);
    const stillBad: Verifier = {
      verify: async () => ({ ...FAIL, bulletVerdicts: [{ text: "Led a fabricated $50M deal", defensible: false, reason: "metric not in profile" }] }),
    };
    const reviser: Reviser = { revise: async (_j, _p, d) => d }; // never fixes the issue
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE, maxRepairs: 2,
      planner: planner([]), generator: generator(failing), reviser, verifier: stillBad,
    });
    expect(res.status).toBe("not-ready");
    expect(res.rounds).toBe(0);
  });

  it("a passing base draft is status ready", async () => {
    const res = await runCoverageLoop({
      jobText: "jd", profile: PROFILE,
      planner: planner([]), generator: generator(bulletDraft(["Cut latency 40%"])),
      reviser: { revise: async (_j, _p, d) => d }, verifier: verifier(),
    });
    expect(res.status).toBe("ready");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run convex/quality/loop.test.ts`
Expected: FAIL — `res.status` is `undefined` (property does not exist yet) and `maxRepairs` is not a recognized dep.

- [ ] **Step 3: Add `status` to the result type and `maxRepairs` to deps**

In `convex/quality/loop.ts`, in `LoopDeps` add the optional field (after `maxRounds?: number;`):

```ts
  maxRepairs?: number; // default 2 — bounded gate-repair attempts on a failing base draft
```

In `LoopResult` add:

```ts
  status: "ready" | "not-ready"; // "not-ready": failed the gate and could not be repaired within budget
```

- [ ] **Step 4: Replace the bail-on-failure block with the gate-repair sub-loop**

In `convex/quality/loop.ts`, replace this existing block:

```ts
  // Invariant: never revise an already-failing draft — surface its gate failure as today.
  if (!hardGatesPass(acceptedVer)) {
    return { draft: accepted, verification: acceptedVer, coverageMap, rounds: 0, improvementSuggestions: suggestions };
  }
```

with:

```ts
  // Gate-repair (§A3): a failing base draft is revised TOWARD the gate, not shipped as-is.
  // Bounded by maxRepairs; each attempt targets the current blocking reasons.
  const maxRepairs = deps.maxRepairs ?? 2;
  let repairs = 0;
  while (!hardGatesPass(acceptedVer) && repairs < maxRepairs) {
    const repairTargets = gateRepairTargets(acceptedVer);
    if (repairTargets.length === 0) break; // gate failed but no actionable target
    let repaired: GeneratedResume;
    try {
      repaired = await reviser.revise(jobText, profile, accepted, repairTargets, "repair");
    } catch {
      break; // malformed/throwing repair → keep the last draft, fall through to not-ready
    }
    accepted = repaired;
    acceptedVer = await verifier.verify(jobText, profile, repaired);
    repairs += 1;
  }

  // Unrepairable within budget → not-ready. Never display a vanity score on this draft (Phase B banner).
  if (!hardGatesPass(acceptedVer)) {
    return { draft: accepted, verification: acceptedVer, coverageMap, rounds: 0, improvementSuggestions: suggestions, status: "not-ready" };
  }
```

- [ ] **Step 5: Add `status: "ready"` to the final return**

In `convex/quality/loop.ts`, the final `return` of `runCoverageLoop` currently is:

```ts
  return { draft: accepted, verification: acceptedVer, coverageMap, rounds, improvementSuggestions: suggestions };
```

Replace it with:

```ts
  return { draft: accepted, verification: acceptedVer, coverageMap, rounds, improvementSuggestions: suggestions, status: "ready" };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run convex/quality/loop.test.ts`
Expected: PASS — the three new behavior tests plus all pre-existing loop tests (which use a passing base draft, so the repair loop is skipped and `status` is `"ready"`).

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json` (expect exit 0)
Run: `npx vitest run` (expect all suites pass)

- [ ] **Step 8: Commit**

```bash
git add convex/quality/loop.ts convex/quality/loop.test.ts
git commit -m "feat(loop): bounded gate-repair sub-loop + ready/not-ready status"
```

---

### Task 4: Strengthen prompts — moderate role/activity entailment + summary overclaim guard

**Files:**
- Modify: `convex/llm/types.ts`

LLM prompt copy is not deterministically unit-testable; this task is verified by typecheck plus a documented manual check (Step 5). The changes make the planner/verifier accept the entailments the corpus supports and stop the summary overclaim that caused the SentiLink fidelity failure.

- [ ] **Step 1: Strengthen `PLANNER_SYSTEM`**

In `convex/llm/types.ts`, in `PLANNER_SYSTEM`, replace the sentence:

```
"(e.g. 'used Tableau' entails 'data visualization')? If supportable, name the evidence (which experience or skill) "
```

with:

```
"(e.g. 'used Tableau' entails 'data visualization')? Treat ROLE- and ACTIVITY-based entailments as supportable when a " +
"reasonable recruiter would accept them and the candidate could defend them in an interview: a customer-facing role " +
"(escalations, disputes, member support, account management) entails 'maintains customer/client relationships'; " +
"building and delivering a training curriculum entails 'delivers presentations / coaching'; presenting findings or " +
"reports to leadership entails 'stakeholder communication'. Do NOT mark such items unsupportable merely because the " +
"exact JD phrase is absent. STILL mark genuinely net-new domains supportable:false: if the profile shows no " +
"sales/account-executive/quota history, 'sales experience' is NOT supportable. If supportable, name the evidence (which experience or skill) "
```

- [ ] **Step 2: Mirror the standard in `VERIFICATION_SYSTEM`**

In `convex/llm/types.ts`, in `VERIFICATION_SYSTEM`, replace:

```
"defensible entailment of profile evidence (e.g. 'used Tableau' entails 'data visualization'). A highlight that " +
```

with:

```
"defensible entailment of profile evidence (e.g. 'used Tableau' entails 'data visualization'). Accept ROLE- and " +
"ACTIVITY-based entailments at the same MODERATE standard: a customer-facing role entails relationship management; " +
"delivering a training curriculum entails presenting/coaching; reporting to leadership entails stakeholder " +
"communication. Defensible = a reasonable recruiter accepts it AND the candidate could defend it in an interview. A highlight that " +
```

- [ ] **Step 3: Add the summary overclaim guard to `GENERATION_SYSTEM`**

In `convex/llm/types.ts`, in `GENERATION_SYSTEM`, find the `SUMMARY:` line and replace:

```
"SUMMARY: 2–3 sentences, ~40–60 words: '[role] with [X]+ years in [domain]' + 1–2 quantified signature achievements " +
```

with:

```
"SUMMARY: 2–3 sentences, ~40–60 words: '[role] with [X]+ years in [domain]' + 1–2 quantified signature achievements " +
"— but SUMMARY HONESTY: do NOT claim domain-specific tenure beyond what the in-domain roles support. Total career " +
"years ≠ years in the JD's domain; if only some roles are in that domain, state the honest split (e.g. '8+ years in " +
"operations & fraud, 3+ in credit/FinTech'), never '8+ years in [domain]' when most years are elsewhere. " +
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0. Run `npx vitest run` — expect all pass (no test depends on prompt copy).

- [ ] **Step 5: Manual verification (document the result in the PR/commit body)**

This requires the deployed Convex env (keys live on the deployment). With the dev deployment running:
1. Deploy: `npx convex dev --once`
2. Regenerate the SentiLink fitting via the app (paste the Identity Verification Analyst JD).
3. Export and inspect: `npx convex export --path /tmp/check.zip`, unzip, read the newest `fittings` doc.
4. Expect: the summary states an honest tenure split (no "8+ years in credit"); at least one `infer`/`compose` bullet surfaces a defensible entailment (customer-relationship / presentation / coaching); `status` = `"ready"`; `rounds` may be > 0.

Record the observed summary line + bullet types in the commit body so the behavior change is auditable. (Per `product-stays-agnostic`, this is a verification check, not a tuning target — do not edit prompts to fit this one corpus; if an entailment is wrong, fix the standard, not the example.)

- [ ] **Step 6: Commit**

```bash
git add convex/llm/types.ts
git commit -m "feat(llm): moderate role/activity entailment in planner+verifier; summary overclaim guard"
```

---

### Task 5: Persist `status` on the fitting

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/fittings.ts`
- Modify: `convex/generate.ts`

The Phase B UI consumes `status` for the not-ready banner; this task persists it so the value exists end-to-end.

- [ ] **Step 1: Add `status` to the `fittings` table schema**

In `convex/schema.ts`, inside the `fittings` table definition, add after the `education` field (added 2026-06-15) and before `fit:`:

```ts
    // Stage-1 outcome: "not-ready" means the draft failed the gate and could not be
    // repaired within budget — Phase B shows a banner instead of a score. Optional for
    // backwards-compat with fittings saved before gate-repair.
    status: v.optional(v.union(v.literal("ready"), v.literal("not-ready"))),
```

- [ ] **Step 2: Accept `status` in `saveFitting` and return it from `getFitting`**

In `convex/fittings.ts`, in the `saveFitting` args object, add after the `education: v.optional(v.array(eduV)),` line:

```ts
    status: v.optional(v.union(v.literal("ready"), v.literal("not-ready"))),
```

(The handler is `ctx.db.insert("fittings", args)`, so no handler change is needed.)

In `convex/fittings.ts`, in the `getFitting` return object, add after `education: f.education ?? [],`:

```ts
      status: f.status ?? "ready",
```

- [ ] **Step 3: Pass `loop.status` from `generate.ts`**

In `convex/generate.ts`, in the `saveFitting` mutation call, add after the `education: canonical.education,` line:

```ts
      status: loop.status,
```

- [ ] **Step 4: Typecheck + full suite**

Run: `npx tsc --noEmit -p tsconfig.json` (expect exit 0)
Run: `npx vitest run` (expect all suites pass)

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/fittings.ts convex/generate.ts
git commit -m "feat(fittings): persist Stage-1 ready/not-ready status"
```

---

## Self-Review (completed during planning)

- **Spec coverage (Phase A):** A1 moderate-entailment planner → Task 4 Step 1. A2 verifier standard → Task 4 Step 2. A3 gate-repair loop → Tasks 1+2+3. A4 summary overclaim guard → Task 4 Step 3. `status` data-model → Task 5. (Phases B and C are out of scope for this plan by design.)
- **Placeholder scan:** none — every code step shows complete code; the one non-TDD task (prompts) has an explicit manual-verification procedure.
- **Type consistency:** `gateRepairTargets(VerificationReport): string[]`, `Reviser.revise(..., mode?: "coverage" | "repair")`, `LoopResult.status: "ready" | "not-ready"`, `LoopDeps.maxRepairs?: number`, and the `status` Convex validator `v.union(v.literal("ready"), v.literal("not-ready"))` are used identically across Tasks 1–5.

## Notes for the executor

- The existing loop tests use a passing base draft, so the gate-repair branch is skipped and `status` is `"ready"` — they must continue to pass unchanged (only additive `status` is introduced).
- Keep repair + coverage rounds within the Convex action time budget: worst case is `maxRepairs` (2) + `2 + 2×maxRounds` (≤8) LLM calls, same order as today.
- Do NOT tune any prompt to the owner's corpus (`product-stays-agnostic`). Validate entailment against diverse fixtures; the SentiLink fitting is one regression check.
