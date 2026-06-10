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
