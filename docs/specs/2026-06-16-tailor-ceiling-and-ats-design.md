# TAILOR — Resume Ceiling + Honest Scoring + ATS Optimization

**Date:** 2026-06-16
**Status:** Design (approved in brainstorming; pending spec review)
**Supersedes/extends:** `docs/specs/2026-06-11-coverage-loop-design.md` (§16 coverage loop)

## Problem

A real generation — Camren's SentiLink "Identity Verification Analyst" fitting — exposed
that TAILOR is **not hitting the resume ceiling** its core promise requires. The ceiling is
the best résumé the user's own corpus can *defensibly* support for a given JD; it is bounded
only by the corpus, and it is **higher** than near-verbatim rephrasing reaches.

### Evidence from the SentiLink fitting (ground truth)

- **Under-shot the ceiling:** 15 bullets were all `rephrase`/`verbatim` — **0 `infer`, 0
  `compose`**. The product's defining move (defensible entailment) was used zero times.
- **Loop never iterated:** `rounds: 0`. Root cause: the base draft failed a hard gate, and
  `loop.ts` bails immediately on a failing base draft (`!hardGatesPass` → return rounds:0).
- **The gate failure was correct and precise** (fidelity): the summary claimed *"8+ years…
  within the credit space"* but only ~3.5 years are credit/FinTech; ~4.5 were philanthropic
  (Satterberg Foundation). A real overclaim — caught, but then **shipped anyway**.
- **Credibility bug:** the gate-failed draft was displayed with `overall: 92`. Meanwhile an
  external scanner (Jobscan) scored the same résumé **33%**. A user who cross-checks sees a
  contradiction and concludes the product is lying.
- **Mislabeled entailments:** the planner marked defensible requirements (`deliver
  presentations`, customer-relationship work) as `unsupportable`, even though the corpus
  supports them via entailment (training-curriculum ×11, stakeholder ×21, customer ×55, and
  customer-facing role titles: User Escalations Specialist, Member Support & Retention,
  Disputes Specialist). Genuinely net-new domains (sales/AE/discovery) are correctly excluded.
- **Tautological score:** `generate.ts:100–111` computes `keyword` as *the generator's own
  chosen keywords present in its own text* (~78%) — not JD coverage. Inflated and meaningless.

## Goals

1. **Reach the ceiling** every generation, where the ceiling = max *defensible* coverage of
   the JD from the corpus (entailment included), never fabrication.
2. **Honest, externally-credible scoring** — no number that contradicts an external scanner
   without explanation; never display a vanity score on a gate-failed draft.
3. **ATS-agnostic generation, then optional ATS-specific optimization** — users usually don't
   know the ATS, so the default output is the agnostic ceiling; ATS tuning is a post-hoc layer.

## Non-goals

- Matching Jobscan's number. Jobscan models legacy exact-match ATS (Taleo/iCIMS); the target
  ATS (Greenhouse, confirmed for SentiLink) does no algorithmic scoring. Jobscan is a useful
  *signal*, not the goal.
- Overfitting to the owner's corpus. Every change must generalize across diverse profiles
  (see `product-stays-agnostic`). Camren's fitting is one regression fixture, never the target.

## Key decisions (settled in brainstorming)

| Decision | Choice |
|---|---|
| Spec scope | All three phases (A + B + C) in one phased spec |
| Entailment posture | **Moderate** — role/activity inferences a recruiter accepts & the candidate could defend in an interview, evidence-cited + verifier-confirmed; excludes net-new domains |
| Score model | **Dual metric** — Ceiling Fit + JD Keyword Coverage; gate-failure banner overrides; gap shown as named requirements |
| ATS targeting | **URL detect + agnostic default** — optional application URL → detect ATS; unknown → exact-match-safe agnostic profile |
| Phase A mechanism | **Upgrade the existing loop in place** (reuse tested pure units) |

## Architecture

```
corpus + JD  ──▶  STAGE 1: Ceiling generation (ATS-agnostic)
                    plan → generate → [diff → revise]* → gate-repair → fixed point
                    └─ output: best DEFENSIBLE résumé (gate-passing ONLY; else not-ready)
                              │
                    ┌─────────┴─────────┐
              SCOREBOARD (B)      STAGE 2: ATS optimization (C, post-hoc)
              Ceiling Fit          detect ATS from URL → tune phrasing/title/structure
              JD Kw Coverage        to that ATS (or agnostic default); adds NO claims;
              gate banner           verifier re-checks
```

The ceiling is a property of **corpus × JD** (Stage 1, ATS-agnostic). ATS optimization is a
**presentation transform** (Stage 2) that never adds a claim. The scoreboard reports both
honestly.

---

## Phase A — Entailment-grounded ceiling generation

Reuses the existing pure, dependency-injected units (`loop.ts`, `coverage.ts`, `select.ts`,
`rubric.ts`); changes are localized.

### A1. Planner → moderate-entailment supportability
- The planner judges `supportable` at the **moderate** standard, not literal/near-verbatim.
- For each supportable requirement it emits `expectedMarkers` that include the *entailed*
  phrasings, plus an `evidenceRef` citing the corpus basis.
- Example: requirement "maintains customer relationships" → `supportable: true`,
  `evidenceRef: "User Escalations Specialist; collaborating with merchants and customers"`,
  `expectedMarkers: ["customer relationships","merchants","escalations","member support"]`.
- Net-new domains with no corpus basis (sales/AE/discovery calls) remain `supportable: false`
  → first-class `unsupportable` suggestions (unchanged behavior for genuine gaps).

### A2. Verifier → moderate defensibility standard
- The verifier currently blesses only near-verbatim bullets (why generation stayed at 0
  infer/0 compose). It moves to the **moderate** standard: a role/activity entailment with a
  cited corpus basis is defensible. `infer`/`compose` bullets are expected and must carry a
  `relationship`/evidence cite.
- The fabrication wall is unchanged: a claim with no corpus basis still fails truthfulness.
- This is a verifier prompt/rubric change, not a change to the pure gate code
  (`hardGatesPass` stays `truthfulness && fidelity && consistency`).

### A3. Gate-repair branch in the loop
- **Today:** `loop.ts` returns immediately when the base draft fails a hard gate (the
  observed `rounds:0`) and ships the failing draft.
- **New:** a failing draft is sent to the `reviser` with the gate's `blockingReasons` as
  **repair targets** (distinct from coverage targets). Re-verify. Bounded by a `maxRepairs`
  budget (default 2).
  - Example repair: "summary overclaims 8+ years in credit" → rewrite summary to
    "8+ years in operations & fraud, ~3.5 in credit/FinTech."
- The loop returns an `accepted` draft **only if it passes the gate**. If still failing after
  `maxRepairs`, it returns `status: "not-ready"` with the blocking reasons (Phase B shows a
  banner, not a score). Coverage rounds proceed only after the draft is gate-passing.

### A4. Summary overclaim guard
- The generator's summary prompt is constrained against asserting domain-specific tenure
  beyond corpus support (the exact failure above). The verifier already catches this; A3 now
  repairs rather than ships it. A4 reduces how often repair is needed.

### Phase A interfaces (sketch)
- `Planner.plan(jobText, profile)` → `CoverageMap` items now reliably populate `supportable`
  (moderate) + `evidenceRef` + entailment `expectedMarkers`.
- `Reviser.revise(jobText, profile, draft, targets, mode)` — add `mode: "coverage" | "repair"`;
  in `repair` mode, `targets` are blocking reasons.
- `loop.ts` `LoopResult` gains `status: "ready" | "not-ready"`; `runCoverageLoop` adds the
  bounded repair sub-loop before the coverage loop.

---

## Phase B — Dual-metric honest scoring

Replaces the blended `overall:92` display with two corpus-honest numbers.

### Ceiling Fit
- `ceilingFit = covered_supportable / total_supportable`.
- `total_supportable` = planner requirements with `supportable: true` (moderate standard).
- `covered_supportable` = those whose `expectedMarkers` appear in the **final gate-passing
  draft**, via the existing deterministic `diffCoverage` (reused, not a new verifier output).
  The verifier's role stays the truthfulness/fidelity/consistency gate; coverage stays the
  deterministic diff the loop already computes.
- **100% = we hit the ceiling.** Corpus-relative, so it cannot contradict external reality.

### JD Keyword Coverage
- New pure fn `jdKeywordCoverage(jdTokens, resumeText)`.
- JD tokens extracted into priority buckets per Jobscan's documented model: **hard skills
  (heaviest) → job title → soft skills → other keywords**; exact + light-stem matching
  (tense/plural tolerant, no full synonymy — mirrors real exact-match scanners).
- Returns a weighted 0–100 that approximates external scanners (≈ the 33 observed). This is
  the honest external cross-check, shown alongside Ceiling Fit.

### Gate banner + named gaps
- If Stage 1 returns `status:"not-ready"`, the UI shows **"Not ready — <blocking reason>"**
  and suppresses the score numbers.
- The gap (`100 − ceilingFit`) plus `unsupportable` requirements render as the existing
  improvement-suggestions list, correctly labeled (`unsupportable` vs `budget` vs
  `gate-rejected`).

### Removals
- Delete the tautological self-keyword score (`generate.ts:100–111`). `fitting.fit.keyword`
  becomes the real `jdKeywordCoverage`.
- Internal sub-scores (verifier coverage, rubric/format, transferability) are retained for
  debugging but are no longer the headline.

---

## Phase C — Stage-2 ATS optimization (post-hoc, adds no claims)

- **Input:** optional `applicationUrl` on the job submission (alongside the pasted JD).
- **`detectAts(url)`** pure fn: domain → `greenhouse | workday | lever | icims | taleo |
  ashby | unknown` (e.g. `job-boards.greenhouse.io` → greenhouse, `myworkdayjobs.com` →
  workday, `*.lever.co` → lever).
- **`atsProfiles`** (static table) — per-ATS invariants:
  - *Agnostic default* (unknown): single column, standard section headers, `Month YYYY`
    dates, exact JD-token phrasing, title mirroring. Helps legacy scanners; never hurts
    Greenhouse or human readers.
  - *Workday*: + strict `Month YYYY`, single-column hard rule.
  - *Greenhouse*: + enforce standard section headers (the Education-section lesson —
    Greenhouse drops content outside recognized headers).
- **Transform:** takes the Stage-1 ceiling draft + chosen profile and ONLY:
  1. re-phrases existing defensible bullets to carry the exact JD token where the bullet
     already supports it (e.g. "delivered training" also surfaces "deliver presentations");
  2. mirrors the JD title in a headline line;
  3. enforces structure/dates/section headers.
- **Invariant:** Stage 2 adds **no new claims**. Output is re-verified; any new
  unsupported claim is rejected. Stage 2 can never breach grounding.

---

## Data model changes

- `jobs` += `applicationUrl?: string`, `detectedAts?: string`.
- `fittings` += `ceilingFit: number`, `jdKeywordCoverage: number`, `status: "ready" |
  "not-ready"`. (`education` already shipped 2026-06-15.)
- `CoverageMap` items reliably carry `supportable`, `evidenceRef`, entailment `expectedMarkers`.

## New, independently unit-testable units (repo vitest pattern)

- `convex/quality/jdKeywordCoverage.ts` — pure; JD-token bucket weighting + exact/stem match.
- `convex/quality/ceilingFit.ts` — pure; covered_supportable / total_supportable.
- `convex/ats/detectAts.ts` — pure; URL → ATS enum.
- `convex/ats/atsProfiles.ts` — static profiles + agnostic default.
- Gate-repair decision logic in `loop.ts` — pure, scripted-stub testable like `nextLoopState`.

## Testing strategy

- **Pure units:** vitest fixtures for `jdKeywordCoverage`, `ceilingFit`, `detectAts`,
  gate-repair decision (matches existing `loop.test.ts` / `coverage.test.ts` pattern).
- **Entailment contract fixtures (LLM-judged via stubs + a few recorded real cases):**
  - "customer-facing roles ⇒ customer relationships" → supportable.
  - "no sales history ⇒ sales experience" → unsupportable.
- **Regression fixture (one among diverse seeded profiles, NOT the tuning target):** the
  SentiLink fitting — expect summary repaired (honest tenure), customer-relationship /
  presentation / coaching bullets surfaced as cited `infer` bullets, `rounds > 0`, Ceiling Fit
  high, JD Keyword Coverage honestly moderate, and the result NOT displayed as a vanity 92.
- **Stage-2 invariant test:** transform output introduces no claim absent from the Stage-1
  draft (verifier re-check passes).

## Rollout / phasing

1. **Phase A** — ceiling generation (planner, verifier standard, gate-repair, summary guard).
2. **Phase B** — dual-metric scoring + gate banner + remove tautological score (depends on A's
   `status` + supportable/covered data).
3. **Phase C** — ATS detection + Stage-2 transform (depends on a stable Stage-1 output).

Each phase becomes its own implementation plan.

## Open questions / risks

- **Entailment drift:** moderate entailment must not creep toward fabrication. Mitigation:
  every `infer`/`compose` bullet requires a cited `evidenceRef`; the independent cross-vendor
  verifier is the wall; contract fixtures pin the supportable/unsupportable boundary.
- **JD token extraction quality** drives JD Keyword Coverage credibility; needs its own small
  eval against a few known JDs.
- **maxRepairs budget** vs Convex action time limit — keep repair + coverage rounds within the
  existing call budget (worst case bounded, like today's loop).
