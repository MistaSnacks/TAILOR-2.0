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
