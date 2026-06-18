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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Score one fixture by running the real loop. Resilient to TRANSIENT failures (e.g. Gemini
 * rate-limit 429s when fixtures run back-to-back): retries with backoff and SURFACES the cause
 * rather than silently returning an error row. A genuine pipeline outcome of "not-ready" is NOT
 * an error and is returned as-is.
 */
export async function scoreFixture(fx: EvalFixture, maxAttempts = 3): Promise<FixtureRow> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      lastErr = err;
      const msg = (err as Error)?.message?.slice(0, 180) ?? String(err);
      if (attempt < maxAttempts) {
        console.error(`\n    ${fx.id} attempt ${attempt} failed (${msg}); backing off ${attempt * 20}s...`);
        await sleep(attempt * 20_000); // 20s, 40s — lets a rate-limit window reset
      } else {
        console.error(`\n    ${fx.id} failed after ${maxAttempts} attempts: ${msg}`);
      }
    }
  }
  return {
    id: fx.id, source: fx.source, status: "error",
    gatePass: false, coverageHitRate: 0, jdEchoRate: 0, longestEcho: 0,
    rubricScore: 0, longBulletRate: 0, skillsCount: 0, rounds: 0,
  };
}
