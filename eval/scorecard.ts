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

/**
 * The reviewable artifact behind each score: the generated résumé prose + the JD it was
 * tailored to + which supportable JD requirements it failed to surface. Persisted separately
 * from the metrics scorecard so the baseline-diff file stays lean while every score is auditable.
 */
export interface FixtureArtifact {
  id: string;
  source: "real" | "hf";
  status: "ready" | "not-ready" | "error";
  jobText: string;
  summary: string;
  experiences: { company: string; position: string; highlights: string[] }[];
  skills: string[];
  missedRequirements: string[];
}

export function writeArtifacts(ranAt: string, artifacts: FixtureArtifact[], dir = resolve(process.cwd(), "eval/results")): string {
  const safe = ranAt.replace(/[:.]/g, "-");
  const path = resolve(dir, `${safe}.artifacts.json`);
  writeFileSync(path, JSON.stringify(artifacts, null, 2));
  return path;
}

export function readBaseline(dir = resolve(process.cwd(), "eval/results")): Aggregate | null {
  try {
    return (JSON.parse(readFileSync(resolve(dir, "baseline.json"), "utf8")) as Scorecard).aggregate;
  } catch {
    return null;
  }
}
