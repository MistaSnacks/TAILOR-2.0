# TAILOR — Eval Harness Design (v1)

*Status: design / approved-in-brainstorm — 2026-06-17*
*Scope: an offline evaluation harness that scores the generation pipeline across many diverse user corpora.*

Related: `docs/research/2026-06-09-resume-quality.md` (the quality doctrine + rubric this measures), `docs/research/2026-06-09-resume-quality-standard.md` (numeric rules), `convex/quality/{rubric,coverage,loop,score}.ts`, `convex/llm/{types,gemini,anthropic,index,verifierSelect}.ts`.

---

## 1. Purpose

Pipeline quality is currently judged one generation at a time (we ran the Clair fitting by hand). That can't tell us whether a prompt change improves résumés *in general* or just for one corpus — and the product's core constraint is that **no logic may be tuned to one user** ([[product-stays-agnostic]]). The eval harness exists to answer, over a **diverse population of users**:

- **Defensibility** — does every bullet survive the independent verifier's hard gates (truthfulness / fidelity / consistency)?
- **Coverage** — for JD requirements the corpus defensibly supports, does the résumé actually surface the keyword (the `atsTerms` mechanism)?
- **Naturalness** — does the résumé sound like the candidate, or does it paste JD phrasing? (The failure mode that motivated this work.)
- **Quality** — does it satisfy the deterministic rubric (length, metric density, no banned openers)?

A change is good only if it holds or improves these **aggregated across the population**, never on a single corpus.

This repo is a **private, experimental alternate pipeline**. If the approach wins, it gets ported into the original app; if not, the repo is scrapped. That permits using the original app's real user data here directly (see §8).

## 2. Scope (v1) and non-goals

**In scope (Approach A — label-free aggregate scorecard):**
- A live runner that pulls N users from the legacy Supabase DB, shapes them into `CanonicalProfile`, pairs each with their real JD, runs the **real** coverage loop, and scores every output.
- Deterministic, LLM-free scorers (coverage hit-rate, JD-echo naturalness, rubric) that are unit-tested in CI.
- An aggregate scorecard written to disk, diffed against a committed baseline, with regression flags.

**Non-goals (deliberately deferred):**
- Authored per-requirement ground-truth labels / coverage precision-recall (Approach B).
- A synthetic fixture generator.
- Gating *live* runs in CI (live runs are on-demand; only the deterministic scorers run in CI).
- Cover letters, multi-language, or any pipeline change — this measures the pipeline, it does not modify it.

## 3. Architecture

All under `tailor/eval/`. Four isolated units + an entry point.

| Unit | Responsibility | Depends on |
|---|---|---|
| `fixtures.ts` | Read-only Supabase adapter → `EvalFixture[]` | `pg`, `convex/llm/types` |
| `scorers.ts` | **Pure, LLM-free** metric functions (unit-tested) | `convex/llm/types`, `convex/quality/{coverage,rubric}` |
| `claudeVerifier.ts` | `Verifier` impl that drives Haiku via the `claude` CLI | `convex/llm/types`, `child_process` |
| `runner.ts` | Orchestrates loop + scoring per fixture | `convex/llm` (Gemini), `convex/quality/loop`, the three above |
| `scorecard.ts` | Aggregate, write `results/<ts>.json`, diff vs `baseline.json`, print | `scorers` output shape |
| `run.ts` | CLI entry (`npm run eval -- --n 20`) | all of the above |

```
EvalFixture { id, source: "real" | "hf", profile: CanonicalProfile, jobText: string, meta }
```

### Data flow
```
Supabase (read-only)
  └─ fixtures.ts ── EvalFixture[] ──┐
                                     ▼  (per fixture)
   runner.ts: runCoverageLoop(profile, jobText,
              planner/generator/reviser = Gemini,   ← local GEMINI_API_KEY
              verifier = claudeVerifier (Haiku))     ← claude CLI, no API key
        └─ { draft, verification, coverageMap, rounds, status }
              ▼
   scorers.ts (pure) ── per-fixture row
              ▼
   scorecard.ts ── results/<ts>.json + diff vs baseline.json + console table
```

## 4. LLM execution (the cross-vendor split)

- **Planner / Generator / Reviser → Gemini**, via the existing `convex/llm/gemini.ts` adapters. The runner reads `GEMINI_API_KEY` / `LLM_MODEL` from the **local environment** (the production keys live on the Convex *deployment*, not locally, so the runner uses a gitignored local env or `npx convex env get`).
- **Verifier → Claude Haiku via the `claude` CLI** (`claudeVerifier.ts`), not the Anthropic SDK / API key. It shells out:
  ```
  claude -p "<user JSON>" --model claude-haiku-4-5-20251001 \
    --system-prompt "<VERIFICATION_SYSTEM>" --output-format json
  ```
  parses the CLI's JSON envelope, then extracts the verdict object with the balanced-JSON extractor (same logic added to `gemini.ts`). This gives true independence (Gemini writes, Claude judges) per §7, using Claude Code's existing model access.
- The deterministic scorers and CI need **no keys**.

## 5. Metrics

**Hard gates (from the verifier, per §6 of the quality doc):** `truthfulness`, `fidelity`, `consistency` → booleans. Aggregate = **gate-pass rate**.

**Graded / deterministic (pure functions in `scorers.ts`):**

- **`coverageHitRate`** — of the coverage-map items marked `supportable`, the fraction whose `atsTerms` ALL appear in the draft (reuses `diffCoverage`). Measures: did we surface the defensibly-supported keywords.
- **`jdEcho` (naturalness)** — the key new metric, now possible because we have the JD text:
  - Normalize JD and each bullet to lowercased, punctuation-stripped token streams.
  - For each bullet, slide an **n = 5** token window; a bullet "echoes" if any 5-gram also occurs in the JD token stream.
  - Report `jdEchoRate` = echoing bullets / total bullets, and `longestEcho` = longest contiguous token span shared with the JD.
  - **Rationale for n = 5:** a legitimate keyword (1–2 tokens, e.g. "financial crimes") never forms a shared 5-gram, so it is *not* penalized — but a pasted JD clause ("written and verbal communication skills to clearly articulate…") does. The threshold cleanly separates "keyword present" (good) from "JD phrasing pasted" (bad). **Lower is more natural.**
- **Rubric reuse** — `scoreDeterministic` supplies `rubricScore`, `longBulletRate` (bullets > 25 words / total), `metricDensity`, `skillsCount`, `skillsCountOk`.

Also recorded per fixture: `rounds`, `status` (`ready` / `not-ready` / `error`).

## 6. Scorecard & regression

`scorecard.ts` writes `eval/results/<ISO-timestamp>.json`:
```jsonc
{
  "ranAt": "<stamped by caller, not in-script>",
  "n": 20, "errors": 1,
  "aggregate": { "gatePassRate": 0.95, "meanCoverageHitRate": 0.88,
                 "meanJdEchoRate": 0.07, "meanLongestEcho": 4.2,
                 "meanRubricScore": 93, "meanRounds": 1.4 },
  "perFixture": [ { "id", "source", "gatePass", "coverageHitRate",
                    "jdEchoRate", "longestEcho", "rubricScore",
                    "longBulletRate", "skillsCount", "rounds", "status" } ]
}
```
It diffs `aggregate` against `eval/results/baseline.json` and flags a **regression** when, beyond a tolerance band Δ:
- `gatePassRate` drops, or
- `meanCoverageHitRate` drops > Δ, or
- `meanJdEchoRate` rises > Δ (naturalness regressed), or
- `meanRubricScore` drops > Δ.

`baseline.json` is committed; promoting a new baseline is a manual, reviewed step (copy a results file over baseline). Date/time is passed in by the caller — scripts must not call `Date.now()` so runs stay reproducible.

## 7. Error handling

- A fixture that throws (LLM error, malformed output, loop failure) is recorded with `status: "error"` and **skipped**; the run continues and reports `errors` count. One bad fixture never aborts the batch.
- Missing `GEMINI_API_KEY` or an absent `claude` CLI → fail fast with an explicit setup message.
- Supabase connection / query failure → explicit error naming the missing/needed `DATABASE_URL`.

## 8. Fixtures (Supabase adapter)

Source: the legacy v4/v5 Supabase DB (`DATABASE_URL` in `tailor/.env.local`, gitignored). Connection via **`pg`** (added as a devDependency — chosen over the REST API for clean multi-table joins; acceptable in a disposable repo).

**Field-map → `CanonicalProfile`** (per `user_id`):
- `basics` ← `profiles` (full_name, phone_number, city/state, portfolio_url, linkedin_url). Minimal; not used by scorers, included for generation realism.
- `experiences[]` ← `canonical_experiences` (position = `primary_title || title`, company = `display_company || company`, dates, `is_current`); `highlights` ← `canonical_experience_bullets` (`text || content`) joined on `canonical_experience_id`.
- `skills[]` ← `canonical_skills` grouped by `category` → `{ name: category, keywords: [label || canonical_name …] }`.
- `education[]` ← `canonical_education` (institution, area = `field_of_study`, studyType = `degree`, dates).
- `jobText` ← that user's `jobs.description` (most recent; users with multiple jobs yield multiple fixtures up to a per-user cap).

**Selection / filtering:** users with ≥ 1 canonical experience AND ≥ 1 job. `source` is tagged `real` vs `hf` (HuggingFace-seeded). The first implementation step inspects the `users` table to determine the seed marker (candidate signals: an email/domain pattern on seeded accounts, or `users.is_legacy`) and encodes it in the adapter; both cohorts are included for diversity, and the scorecard breaks aggregates down by `source`.

**Privacy hygiene (light floor, since the repo is private):** the adapter never reads auth/secret columns (`accounts.*_token`, `users.password_hash`). Contact basics are pulled but irrelevant to scoring.

## 9. Testing

- **`scorers.ts` unit tests** (Vitest, deterministic, CI): `coverageHitRate`, `jdEcho` (incl. the keyword-not-penalized / pasted-clause-penalized cases), rubric pass-through. These are the CI guardrail.
- A tiny **committed synthetic fixture** (1–2 HF users, PII-free) smoke-tests the runner wiring without invoking live LLMs.
- The live runner itself is exercised on-demand, not in CI.

## 10. Runbook

```
# one-time: provide Gemini key locally (gitignored)
echo 'GEMINI_API_KEY=…' >> tailor/.env.local
# DATABASE_URL already present in tailor/.env.local

npm run eval -- --n 20        # live run over 20 users → results/<ts>.json + baseline diff
npm run test -- eval/scorers  # deterministic scorers (CI)
```

## 11. Open questions / future

- **Ground-truth labels (Approach B):** add a small hand-labeled subset to measure coverage precision/recall (are we surfacing the *right* requirements, not just *some* terms).
- **Synthetic fixture generator:** the spec's long-term vision; only if real+HF diversity proves insufficient.
- **Real-vs-HF cohort gating:** once we trust the metric, gate per cohort separately.
- **Old `ats_scores` / `resume_versions` as reference:** the legacy DB stored prior ATS scores and generated résumés — a possible external cross-check on our coverage metric.
