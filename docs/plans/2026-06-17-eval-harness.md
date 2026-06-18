# Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline harness that runs the real generation pipeline over many legacy-DB users and scores defensibility, coverage, and naturalness into an aggregate scorecard with baseline-diff regression flags.

**Architecture:** A `tailor/eval/` package. Pure, LLM-free scorers (`scorers.ts`, `scorecard.ts`) are unit-tested in CI. A `pg` adapter (`fixtures.ts`) shapes legacy Supabase rows into `CanonicalProfile`. A live `runner.ts` runs `runCoverageLoop` with Gemini (plan/generate/revise) + a `claude`-CLI Haiku verifier (`claudeVerifier.ts`), then scores each output. `run.ts` is the CLI entry.

**Tech Stack:** TypeScript, `tsx` (run TS entry), `pg` (Supabase Postgres), Vitest (existing), the existing `convex/llm` Gemini adapters + `convex/quality` modules, the `claude` CLI for the verifier.

**Spec:** `docs/specs/2026-06-17-eval-harness-design.md`

---

## Key types & signatures this plan reuses (do not redefine)

From `convex/llm/types.ts`:
- `CanonicalProfile { basics, experiences, skills, education }`
- `GeneratedResume { summary, experiences:[{company,position,startDate?,endDate?,highlights:[{text,type,relationship?}]}], skills:string[], requirements:[{text,covered}], keywords:string[] }`
- `CoverageMap = CoveragePlanItem[]`; `CoveragePlanItem { requirement, supportable, evidenceRef?, atsTerms?:string[], expectedMarkers:string[] }`
- `VerificationReport { bulletVerdicts, truthfulnessPass, fidelityPass, fidelityIssues, consistencyPass, consistencyIssues, coverageScore, transferabilityScore }`
- `Verifier { verify(jobText, profile, resume): Promise<VerificationReport> }`
- `VERIFICATION_SYSTEM: string`

From `convex/quality/coverage.ts`: `diffCoverage(map: CoverageMap, text: string): { covered, gaps }`, `draftText(d): string`
From `convex/quality/rubric.ts`: `scoreDeterministic(r: ScorableResume): DeterministicReport`, `ScorableResume { summary, experiences:[{highlights:[{text}]}], skills:string[] }`
From `convex/quality/loop.ts`: `runCoverageLoop(deps): Promise<LoopResult>`, `LoopResult { draft, verification, coverageMap, rounds, improvementSuggestions, status }`
From `convex/llm/gemini.ts`: `GeminiGenerator`, `GeminiPlanner`, `GeminiReviser` (classes)

---

## Task 1: Project setup (deps, script, env loader)

**Files:**
- Modify: `package.json` (devDependencies + `eval` script)
- Create: `eval/env.ts`
- Create: `eval/results/.gitkeep`

- [ ] **Step 1: Add devDependencies and the eval script**

Run:
```bash
cd "/Users/admin/untitled folder 3/tailor"
npm install --save-dev pg @types/pg tsx
```

Then add to `package.json` `"scripts"` (keep existing entries):
```json
    "eval": "tsx eval/run.ts",
    "eval:test": "vitest run eval"
```

- [ ] **Step 2: Create the env loader** (loads `.env.local` into `process.env` for the standalone runner; no new dep)

Create `eval/env.ts`:
```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load KEY=VALUE lines from .env.local into process.env (does not overwrite existing). */
export function loadEnvLocal(path = resolve(process.cwd(), ".env.local")): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return; // no .env.local — rely on the ambient environment
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
}
```

- [ ] **Step 3: Keep results dir tracked**

Run:
```bash
mkdir -p eval/results && touch eval/results/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json eval/env.ts eval/results/.gitkeep
git commit -m "chore(eval): scaffold eval package (deps, script, env loader)"
```

---

## Task 2: `eval/json.ts` — balanced-JSON extractor (TDD)

**Files:**
- Create: `eval/json.ts`
- Test: `eval/json.test.ts`

- [ ] **Step 1: Write the failing test**

Create `eval/json.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { firstJsonValue } from "./json";

describe("firstJsonValue", () => {
  it("returns the object and ignores trailing prose", () => {
    expect(firstJsonValue('{"a":1}\n\nNote: done')).toBe('{"a":1}');
  });
  it("ignores a second appended object", () => {
    expect(firstJsonValue('{"a":1}{"b":2}')).toBe('{"a":1}');
  });
  it("is not fooled by braces inside strings", () => {
    expect(firstJsonValue('{"a":"}{"}')).toBe('{"a":"}{"}');
  });
  it("throws when no JSON value is present", () => {
    expect(() => firstJsonValue("no json here")).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run eval/json.test.ts`
Expected: FAIL (cannot find module `./json`).

- [ ] **Step 3: Implement**

Create `eval/json.ts`:
```ts
/**
 * Return the first COMPLETE, balanced JSON value (object/array) in `text`, string-aware so
 * braces inside strings don't miscount. Tolerates surrounding prose or an appended second value.
 */
export function firstJsonValue(text: string): string {
  let i = 0;
  while (i < text.length && text[i] !== "{" && text[i] !== "[") i++;
  if (i >= text.length) throw new Error("no JSON value in text");
  const open = text[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(i, j + 1);
  }
  throw new Error("unterminated JSON value in text");
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run eval/json.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add eval/json.ts eval/json.test.ts
git commit -m "feat(eval): balanced-JSON extractor for CLI output parsing"
```

---

## Task 3: `eval/scorers.ts` — pure metrics (TDD)

**Files:**
- Create: `eval/scorers.ts`
- Test: `eval/scorers.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `eval/scorers.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { coverageHitRate, jdEcho } from "./scorers";
import type { CoverageMap } from "../convex/llm/types";

describe("coverageHitRate", () => {
  it("counts a supportable item covered only when its atsTerm appears", () => {
    const map: CoverageMap = [
      { requirement: "Analytical", supportable: true, atsTerms: ["analytical"], expectedMarkers: ["data analysis"] },
      { requirement: "SQL", supportable: true, atsTerms: ["sql"], expectedMarkers: [] },
    ];
    // "analytical" present, "sql" absent -> 1 of 2
    expect(coverageHitRate(map, "applied analytical judgment to fraud cases")).toBe(0.5);
  });
  it("a paraphrase alone does not count (atsTerm required)", () => {
    const map: CoverageMap = [
      { requirement: "Analytical", supportable: true, atsTerms: ["analytical"], expectedMarkers: ["data analysis"] },
    ];
    expect(coverageHitRate(map, "led data analysis of fraud trends")).toBe(0);
  });
  it("returns 1 when there are no supportable requirements", () => {
    const map: CoverageMap = [
      { requirement: "PhD", supportable: false, atsTerms: ["phd"], expectedMarkers: [] },
    ];
    expect(coverageHitRate(map, "anything")).toBe(1);
  });
});

describe("jdEcho", () => {
  const jd = "Excellent written and verbal communication skills with the ability to clearly articulate investigative findings and recommendations.";
  it("flags a bullet that pastes a 5-gram from the JD", () => {
    const r = jdEcho(["Prepared case files, utilizing written and verbal communication skills with the ability to clearly articulate findings"], jd);
    expect(r.jdEchoRate).toBe(1);
    expect(r.longestEcho).toBeGreaterThanOrEqual(5);
  });
  it("does NOT penalize a short keyword overlap (no 5-gram)", () => {
    const r = jdEcho(["Communicated fraud trends to stakeholders, reducing losses by $50K monthly"], jd);
    expect(r.jdEchoRate).toBe(0);
    expect(r.longestEcho).toBeLessThan(5);
  });
  it("rate is 0 for no bullets", () => {
    expect(jdEcho([], jd).jdEchoRate).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run eval/scorers.test.ts`
Expected: FAIL (cannot find module `./scorers`).

- [ ] **Step 3: Implement**

Create `eval/scorers.ts`:
```ts
import { diffCoverage } from "../convex/quality/coverage";
import type { CoverageMap } from "../convex/llm/types";

/** Fraction of SUPPORTABLE requirements whose atsTerms land in the draft (reuses diffCoverage). */
export function coverageHitRate(map: CoverageMap, text: string): number {
  const { covered, gaps } = diffCoverage(map, text.toLowerCase());
  const total = covered.length + gaps.length;
  return total === 0 ? 1 : covered.length / total;
}

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function longestSharedSpan(bulletToks: string[], jdJoined: string): number {
  let best = 0;
  for (let i = 0; i < bulletToks.length; i++) {
    for (let k = best + 1; i + k <= bulletToks.length; k++) {
      const gram = " " + bulletToks.slice(i, i + k).join(" ") + " ";
      if (jdJoined.includes(gram)) best = k;
      else break;
    }
  }
  return best;
}

/**
 * Naturalness: how much résumé prose echoes the JD verbatim. n=5 ignores legitimate
 * 1-2 token keyword overlaps but catches pasted JD clauses. Lower is more natural.
 */
export function jdEcho(bullets: string[], jobText: string, n = 5): { jdEchoRate: number; longestEcho: number } {
  const jd = tokens(jobText);
  const jdJoined = " " + jd.join(" ") + " ";
  const jdGrams = new Set<string>();
  for (let i = 0; i + n <= jd.length; i++) jdGrams.add(jd.slice(i, i + n).join(" "));

  let echoing = 0;
  let longest = 0;
  for (const b of bullets) {
    const t = tokens(b);
    let hit = false;
    for (let i = 0; i + n <= t.length; i++) {
      if (jdGrams.has(t.slice(i, i + n).join(" "))) { hit = true; break; }
    }
    if (hit) echoing++;
    longest = Math.max(longest, longestSharedSpan(t, jdJoined));
  }
  return { jdEchoRate: bullets.length ? echoing / bullets.length : 0, longestEcho: longest };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run eval/scorers.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add eval/scorers.ts eval/scorers.test.ts
git commit -m "feat(eval): pure coverage-hit-rate and jd-echo naturalness scorers"
```

---

## Task 4: `eval/scorecard.ts` — aggregate, diff, persist (TDD the pure parts)

**Files:**
- Create: `eval/scorecard.ts`
- Test: `eval/scorecard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `eval/scorecard.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { aggregate, diffBaseline, type FixtureRow } from "./scorecard";

const row = (over: Partial<FixtureRow> = {}): FixtureRow => ({
  id: "u1", source: "real", status: "ready",
  gatePass: true, coverageHitRate: 1, jdEchoRate: 0, longestEcho: 2,
  rubricScore: 100, longBulletRate: 0, skillsCount: 18, rounds: 1,
  ...over,
});

describe("aggregate", () => {
  it("computes means over scored (non-error) rows only", () => {
    const a = aggregate([row(), row({ id: "u2", gatePass: false, coverageHitRate: 0.5, rubricScore: 80 }), row({ id: "u3", status: "error" })]);
    expect(a.n).toBe(3);
    expect(a.errors).toBe(1);
    expect(a.gatePassRate).toBe(0.5); // 1 of 2 scored
    expect(a.meanCoverageHitRate).toBeCloseTo(0.75);
    expect(a.meanRubricScore).toBe(90);
  });
});

describe("diffBaseline", () => {
  const base = aggregate([row(), row()]); // perfect baseline
  it("flags a coverage drop and a naturalness regression beyond delta", () => {
    const now = aggregate([row({ coverageHitRate: 0.6 }), row({ jdEchoRate: 0.4 })]);
    const flags = diffBaseline(now, base, 0.05);
    expect(flags.some((f) => f.includes("coverage"))).toBe(true);
    expect(flags.some((f) => f.includes("jdEcho"))).toBe(true);
  });
  it("no flags when within delta", () => {
    expect(diffBaseline(aggregate([row(), row()]), base, 0.05)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run eval/scorecard.test.ts`
Expected: FAIL (cannot find module `./scorecard`).

- [ ] **Step 3: Implement**

Create `eval/scorecard.ts`:
```ts
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface FixtureRow {
  id: string;
  source: "real" | "hf";
  status: "ready" | "not-ready" | "error";
  gatePass: boolean;
  coverageHitRate: number;
  jdEchoRate: number;
  longestEcho: number;
  rubricScore: number;
  longBulletRate: number;
  skillsCount: number;
  rounds: number;
}

export interface Aggregate {
  n: number;
  errors: number;
  scored: number;
  gatePassRate: number;
  meanCoverageHitRate: number;
  meanJdEchoRate: number;
  meanLongestEcho: number;
  meanRubricScore: number;
  meanRounds: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function aggregate(rows: FixtureRow[]): Aggregate {
  const scored = rows.filter((r) => r.status !== "error");
  return {
    n: rows.length,
    errors: rows.length - scored.length,
    scored: scored.length,
    gatePassRate: scored.length ? scored.filter((r) => r.gatePass).length / scored.length : 0,
    meanCoverageHitRate: mean(scored.map((r) => r.coverageHitRate)),
    meanJdEchoRate: mean(scored.map((r) => r.jdEchoRate)),
    meanLongestEcho: mean(scored.map((r) => r.longestEcho)),
    meanRubricScore: mean(scored.map((r) => r.rubricScore)),
    meanRounds: mean(scored.map((r) => r.rounds)),
  };
}

/** Return human-readable regression flags comparing `now` to `base` with tolerance `delta`. */
export function diffBaseline(now: Aggregate, base: Aggregate, delta = 0.05): string[] {
  const flags: string[] = [];
  if (now.gatePassRate < base.gatePassRate - 1e-9)
    flags.push(`gatePassRate ${base.gatePassRate.toFixed(2)} -> ${now.gatePassRate.toFixed(2)}`);
  if (now.meanCoverageHitRate < base.meanCoverageHitRate - delta)
    flags.push(`coverage ${base.meanCoverageHitRate.toFixed(2)} -> ${now.meanCoverageHitRate.toFixed(2)}`);
  if (now.meanJdEchoRate > base.meanJdEchoRate + delta)
    flags.push(`jdEcho ${base.meanJdEchoRate.toFixed(2)} -> ${now.meanJdEchoRate.toFixed(2)} (less natural)`);
  if (now.meanRubricScore < base.meanRubricScore - delta * 100)
    flags.push(`rubric ${base.meanRubricScore.toFixed(0)} -> ${now.meanRubricScore.toFixed(0)}`);
  return flags;
}

export interface Scorecard { ranAt: string; aggregate: Aggregate; perFixture: FixtureRow[] }

export function writeScorecard(card: Scorecard, dir = resolve(process.cwd(), "eval/results")): string {
  const safe = card.ranAt.replace(/[:.]/g, "-");
  const path = resolve(dir, `${safe}.json`);
  writeFileSync(path, JSON.stringify(card, null, 2));
  return path;
}

export function readBaseline(dir = resolve(process.cwd(), "eval/results")): Aggregate | null {
  try {
    return (JSON.parse(readFileSync(resolve(dir, "baseline.json"), "utf8")) as Scorecard).aggregate;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run eval/scorecard.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add eval/scorecard.ts eval/scorecard.test.ts
git commit -m "feat(eval): scorecard aggregate + baseline-diff regression flags"
```

---

## Task 5: `eval/fixtures.ts` — Supabase → CanonicalProfile adapter

**Files:**
- Create: `eval/fixtures.ts`

> Integration (hits the legacy DB) — implement fully, then verify with the manual smoke step. Requires `DATABASE_URL` in `.env.local`.

- [ ] **Step 1: Implement the adapter**

Create `eval/fixtures.ts`:
```ts
import { Client } from "pg";
import type { CanonicalProfile } from "../convex/llm/types";

export interface EvalFixture {
  id: string;
  source: "real" | "hf";
  profile: CanonicalProfile;
  jobText: string;
  meta: { email?: string };
}

function client(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set (expected in .env.local)");
  return new Client({ connectionString, ssl: { rejectUnauthorized: false } });
}

/** HF-seeded detection: refined in Step 2 after inspecting the users table. */
function sourceOf(email: string | null, isLegacy: boolean | null): "real" | "hf" {
  if (email && /(\+hf|@example\.|huggingface|seed)/i.test(email)) return "hf";
  return isLegacy ? "real" : "real";
}

export async function loadFixtures(limit: number): Promise<EvalFixture[]> {
  const db = client();
  await db.connect();
  try {
    const users = await db.query(
      `select u.id, u.email, u.is_legacy from users u
       where exists (select 1 from canonical_experiences ce where ce.user_id = u.id)
         and exists (select 1 from jobs j where j.user_id = u.id and j.description is not null)
       order by u.created_at desc limit $1`,
      [limit],
    );

    const fixtures: EvalFixture[] = [];
    for (const u of users.rows) {
      const exps = await db.query(
        `select id, coalesce(display_company, company) company,
                coalesce(primary_title, title) position, primary_location location,
                start_date, end_date, is_current
         from canonical_experiences where user_id = $1
         order by is_current desc, end_date desc nulls first`,
        [u.id],
      );
      const experiences = [];
      for (const e of exps.rows) {
        const bullets = await db.query(
          `select coalesce(text, content) txt from canonical_experience_bullets
           where canonical_experience_id = $1 order by created_at`,
          [e.id],
        );
        experiences.push({
          company: e.company ?? "",
          position: e.position ?? "",
          location: e.location ?? undefined,
          startDate: e.start_date ?? undefined,
          endDate: e.end_date ?? undefined,
          isCurrent: !!e.is_current,
          highlights: bullets.rows.map((b) => b.txt).filter((t: string) => t && t.trim()),
        });
      }

      const skillRows = await db.query(
        `select coalesce(category, 'Skills') category, coalesce(label, canonical_name, name) label
         from canonical_skills where user_id = $1`,
        [u.id],
      );
      const byCat = new Map<string, string[]>();
      for (const s of skillRows.rows) {
        if (!s.label) continue;
        const arr = byCat.get(s.category) ?? [];
        arr.push(s.label);
        byCat.set(s.category, arr);
      }
      const skills = [...byCat.entries()].map(([name, keywords]) => ({ name, keywords }));

      const edu = await db.query(
        `select institution, field_of_study, degree, start_date, end_date
         from canonical_education where user_id = $1`,
        [u.id],
      );
      const education = edu.rows.map((d) => ({
        institution: d.institution ?? "",
        area: d.field_of_study ?? undefined,
        studyType: d.degree ?? undefined,
        startDate: d.start_date ?? undefined,
        endDate: d.end_date ?? undefined,
      }));

      const job = await db.query(
        `select description from jobs where user_id = $1 and description is not null
         order by created_at desc limit 1`,
        [u.id],
      );
      const jobText = job.rows[0]?.description;
      if (!jobText || experiences.length === 0) continue;

      const profile: CanonicalProfile = { basics: { profiles: [] }, experiences, skills, education };
      fixtures.push({ id: u.id, source: sourceOf(u.email, u.is_legacy), profile, jobText, meta: { email: u.email ?? undefined } });
    }
    return fixtures;
  } finally {
    await db.end();
  }
}
```

- [ ] **Step 2: Refine the HF-seed marker**

Run (inspect how seeded users differ — emails/flags):
```bash
cd "/Users/admin/untitled folder 3/tailor"
npx tsx -e "import {loadEnvLocal} from './eval/env'; loadEnvLocal(); import('pg').then(async({Client})=>{const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});await c.connect();const r=await c.query('select email, is_legacy from users order by created_at desc limit 30');console.table(r.rows);await c.end();})"
```
Expected: a table of recent users. Update `sourceOf()` regex/flag in `fixtures.ts` to match the real seed pattern you observe (e.g. a shared seed domain). If none is distinguishable, leave all as `real` and note it.

- [ ] **Step 3: Smoke-test the adapter (manual, hits DB)**

Run:
```bash
npx tsx -e "import {loadEnvLocal} from './eval/env'; loadEnvLocal(); import('./eval/fixtures').then(async m=>{const f=await m.loadFixtures(2); console.log(JSON.stringify(f.map(x=>({id:x.id,source:x.source,exps:x.profile.experiences.length,skills:x.profile.skills.length,jobChars:x.jobText.length})),null,2));})"
```
Expected: JSON for 2 fixtures, each with `exps >= 1`, `skills >= 0`, `jobChars > 0`. If `exps` is 0, fix the join/column mapping.

- [ ] **Step 4: Commit**

```bash
git add eval/fixtures.ts
git commit -m "feat(eval): Supabase adapter mapping legacy users to CanonicalProfile + JD"
```

---

## Task 6: `eval/claudeVerifier.ts` — Haiku verifier via the `claude` CLI

**Files:**
- Create: `eval/claudeVerifier.ts`

- [ ] **Step 1: Implement**

Create `eval/claudeVerifier.ts`:
```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { VERIFICATION_SYSTEM, type CanonicalProfile, type GeneratedResume, type VerificationReport, type Verifier } from "../convex/llm/types";
import { firstJsonValue } from "./json";

const run = promisify(execFile);
const MODEL = process.env.EVAL_VERIFIER_MODEL ?? "claude-haiku-4-5-20251001";

/** Verifier that drives Claude Haiku through the local `claude` CLI (no Anthropic API key). */
export class ClaudeCliVerifier implements Verifier {
  async verify(jobText: string, profile: CanonicalProfile, resume: GeneratedResume): Promise<VerificationReport> {
    const user = JSON.stringify({ jobDescription: jobText, profile, resume });
    const { stdout } = await run(
      "claude",
      ["-p", user, "--model", MODEL, "--system-prompt", VERIFICATION_SYSTEM, "--output-format", "json"],
      { maxBuffer: 16 * 1024 * 1024, timeout: 180_000 },
    );
    // --output-format json wraps the reply: { type, subtype, result: "<assistant text>", ... }
    const envelope = JSON.parse(stdout) as { result?: string };
    const text = envelope.result ?? stdout;
    return JSON.parse(firstJsonValue(text)) as VerificationReport;
  }
}
```

- [ ] **Step 2: Smoke-test the verifier (manual, invokes the claude CLI)**

Run:
```bash
cd "/Users/admin/untitled folder 3/tailor"
npx tsx -e "import('./eval/claudeVerifier').then(async m=>{const v=new m.ClaudeCliVerifier(); const r=await v.verify('Fraud analyst. Strong SQL.', {basics:{profiles:[]},experiences:[{company:'X',position:'Analyst',isCurrent:true,highlights:['Built SQL dashboards cutting review time 30%']}],skills:[{name:'Data',keywords:['SQL']}],education:[]}, {summary:'Analyst', experiences:[{company:'X',position:'Analyst',highlights:[{text:'Built SQL dashboards cutting review time 30%',type:'verbatim'}]}], skills:['SQL'], requirements:[], keywords:[]}); console.log('truthful:',r.truthfulnessPass,'fidelity:',r.fidelityPass,'consistency:',r.consistencyPass,'verdicts:',r.bulletVerdicts?.length);})"
```
Expected: prints booleans (likely all `true`) and a verdict count ≥ 1. If it errors on parsing, inspect the raw CLI output and adjust envelope handling.

- [ ] **Step 3: Commit**

```bash
git add eval/claudeVerifier.ts
git commit -m "feat(eval): Claude-CLI Haiku verifier for cross-vendor independence"
```

---

## Task 7: `eval/runner.ts` — score one fixture

**Files:**
- Create: `eval/runner.ts`

- [ ] **Step 1: Implement**

Create `eval/runner.ts`:
```ts
import { GeminiGenerator, GeminiPlanner, GeminiReviser } from "../convex/llm/gemini";
import { runCoverageLoop } from "../convex/quality/loop";
import { scoreDeterministic, type ScorableResume } from "../convex/quality/rubric";
import { draftText } from "../convex/quality/coverage";
import { coverageHitRate, jdEcho } from "./scorers";
import { ClaudeCliVerifier } from "./claudeVerifier";
import type { EvalFixture } from "./fixtures";
import type { FixtureRow } from "./scorecard";

const planner = new GeminiPlanner();
const generator = new GeminiGenerator();
const reviser = new GeminiReviser();
const verifier = new ClaudeCliVerifier();

export async function scoreFixture(fx: EvalFixture): Promise<FixtureRow> {
  try {
    const loop = await runCoverageLoop({ jobText: fx.jobText, profile: fx.profile, planner, generator, reviser, verifier });
    const d = loop.draft;
    const bullets = d.experiences.flatMap((e) => e.highlights.map((h) => h.text));
    const scorable: ScorableResume = {
      summary: d.summary ?? "",
      experiences: d.experiences.map((e) => ({ highlights: e.highlights.map((h) => ({ text: h.text })) })),
      skills: d.skills ?? [],
    };
    const det = scoreDeterministic(scorable);
    const echo = jdEcho(bullets, fx.jobText);
    const v = loop.verification;
    return {
      id: fx.id, source: fx.source, status: loop.status,
      gatePass: !!(v.truthfulnessPass && v.fidelityPass && v.consistencyPass),
      coverageHitRate: coverageHitRate(loop.coverageMap, draftText(d)),
      jdEchoRate: echo.jdEchoRate, longestEcho: echo.longestEcho,
      rubricScore: det.score,
      longBulletRate: det.totalBullets ? det.longBulletHits.length / det.totalBullets : 0,
      skillsCount: det.skillsCount, rounds: loop.rounds,
    };
  } catch (err) {
    return {
      id: fx.id, source: fx.source, status: "error",
      gatePass: false, coverageHitRate: 0, jdEchoRate: 0, longestEcho: 0,
      rubricScore: 0, longBulletRate: 0, skillsCount: 0, rounds: 0,
    };
  }
}
```

- [ ] **Step 2: Smoke-test with a synthetic fixture (uses Gemini + claude CLI)**

Requires `GEMINI_API_KEY` in `.env.local`. Run:
```bash
cd "/Users/admin/untitled folder 3/tailor"
npx tsx -e "import {loadEnvLocal} from './eval/env'; loadEnvLocal(); import('./eval/runner').then(async m=>{const fx={id:'t1',source:'hf',meta:{},jobText:'Fraud analyst with strong analytical skills and SQL.',profile:{basics:{profiles:[]},experiences:[{company:'Acme',position:'Fraud Analyst',isCurrent:true,highlights:['Analyzed 3,000 accounts weekly, cutting losses 20% using SQL']}],skills:[{name:'Data',keywords:['SQL']}],education:[]}}; const row=await m.scoreFixture(fx); console.log(JSON.stringify(row,null,2));})"
```
Expected: a `FixtureRow` with `status:"ready"`, `gatePass:true`, numeric `coverageHitRate`/`jdEchoRate`/`rubricScore`. (Takes a few minutes — full loop.)

- [ ] **Step 3: Commit**

```bash
git add eval/runner.ts
git commit -m "feat(eval): per-fixture runner (real loop + scoring)"
```

---

## Task 8: `eval/run.ts` — CLI entry, first run, seed baseline

**Files:**
- Create: `eval/run.ts`

- [ ] **Step 1: Implement the CLI**

Create `eval/run.ts`:
```ts
import { loadEnvLocal } from "./env";
import { loadFixtures } from "./fixtures";
import { scoreFixture } from "./runner";
import { aggregate, diffBaseline, writeScorecard, readBaseline, type FixtureRow } from "./scorecard";

function arg(name: string, def: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "";
  const flagIdx = process.argv.indexOf(`--${name}`);
  if (hit) return hit.split("=")[1];
  if (flagIdx >= 0 && process.argv[flagIdx + 1]) return process.argv[flagIdx + 1];
  return def;
}

async function main() {
  loadEnvLocal();
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set (add to .env.local for the live runner)");
  const n = parseInt(arg("n", "10"), 10);
  const ranAt = arg("at", "manual-run"); // caller passes a timestamp; scripts must not call Date.now()

  console.log(`Loading ${n} fixtures...`);
  const fixtures = await loadFixtures(n);
  console.log(`Running pipeline over ${fixtures.length} fixtures (this is slow)...`);

  const rows: FixtureRow[] = [];
  for (const [i, fx] of fixtures.entries()) {
    process.stdout.write(`  [${i + 1}/${fixtures.length}] ${fx.id} (${fx.source})... `);
    const row = await scoreFixture(fx);
    rows.push(row);
    console.log(row.status === "error" ? "ERROR" : `gate=${row.gatePass} cov=${row.coverageHitRate.toFixed(2)} echo=${row.jdEchoRate.toFixed(2)} rubric=${row.rubricScore}`);
  }

  const agg = aggregate(rows);
  const path = writeScorecard({ ranAt, aggregate: agg, perFixture: rows });
  console.log("\n=== AGGREGATE ===");
  console.table(agg);

  const base = readBaseline();
  if (!base) {
    console.log("\nNo baseline.json yet. Promote this run: cp '" + path + "' eval/results/baseline.json");
  } else {
    const flags = diffBaseline(agg, base);
    console.log(flags.length ? "\nREGRESSIONS:\n - " + flags.join("\n - ") : "\nNo regressions vs baseline.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: First live run** (provide `GEMINI_API_KEY` in `.env.local` first)

Run:
```bash
cd "/Users/admin/untitled folder 3/tailor"
npm run eval -- --n 5 --at 2026-06-17T00-00-00
```
Expected: per-fixture progress lines, an aggregate table, a written `eval/results/<at>.json`, and a "No baseline.json yet" message.

- [ ] **Step 3: Review the scorecard, then seed the baseline**

Inspect the aggregate (gate-pass rate, mean coverage, mean jdEcho, mean rubric). When it looks sane, promote it:
```bash
cp eval/results/2026-06-17T00-00-00.json eval/results/baseline.json
```

- [ ] **Step 4: Final test sweep**

Run: `npx vitest run eval` and `npx tsc --noEmit`
Expected: all eval unit tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add eval/run.ts eval/results/baseline.json
git commit -m "feat(eval): CLI entry, scorecard output, seed baseline"
```

---

## Self-review notes (addressed)

- **Spec coverage:** fixtures (§8) → Task 5; scorers incl. jdEcho/coverage (§5) → Task 3; scorecard + baseline diff (§6) → Task 4; Gemini+Claude-CLI execution (§4) → Tasks 6–7; error handling (§7) → Task 7 try/catch + Task 8 key check; CI deterministic tests (§9) → Tasks 2–4; runbook (§10) → Task 8.
- **Naturalness metric** is unit-tested for both the keyword-not-penalized and pasted-clause cases (Task 3), which is the core behavioral guarantee.
- **No `Date.now()`** in scripts — `ranAt` is passed via `--at` (matches the workflow/reproducibility constraint).
- **Type consistency:** `FixtureRow` defined in Task 4 is the exact shape returned by Task 7 and consumed by Task 8; `EvalFixture` defined in Task 5 is consumed by Task 7.
- **Known runtime cost:** the live runner is minutes-per-fixture (full loop + multiple Haiku verifications); intended for on-demand use, not CI.
