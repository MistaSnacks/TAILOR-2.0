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
