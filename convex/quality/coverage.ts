// convex/quality/coverage.ts
// Pure, LLM-free coverage diff for the §16 loop. No Convex/node imports.
import type { CoverageMap, CoveragePlanItem, GeneratedResume } from "../llm/types";

/** Flatten a draft to a single lowercased haystack: summary + all bullets + skills. */
export function draftText(d: GeneratedResume): string {
  const bullets = d.experiences.flatMap((e) => e.highlights.map((h) => h.text));
  return [d.summary, ...bullets, ...d.skills].join("\n").toLowerCase();
}

/** Length of the shared leading prefix of two strings. */
function commonPrefix(a: string, b: string): number {
  let i = 0;
  const m = Math.min(a.length, b.length);
  while (i < m && a[i] === b[i]) i++;
  return i;
}

/**
 * Is `term` present in the draft, tolerant of word-form (so 'communication' matches 'communicated')?
 * - Multi-word phrase → exact substring (phrases rarely inflect; keeps "financial crimes" literal).
 * - Single word, exact substring present → hit.
 * - Single word ≥6 chars → hit if some draft word shares a ≥6-char stem (catches inflections like
 *   coordinating/coordinated, but NOT near-homographs like analytical/analysis which diverge at 5).
 * - Short word (<6, e.g. an acronym like 'sql','aml') → exact substring only.
 */
function termPresent(term: string, text: string, words: string[]): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  if (t.includes(" ")) return text.includes(t);
  if (text.includes(t)) return true;
  if (t.length < 6) return false;
  return words.some((w) => w.length >= 6 && commonPrefix(t, w) >= 6);
}

/**
 * A supportable requirement is "covered" iff the JD's literal term actually appears in the draft.
 * The planner's `atsTerms` are ALTERNATIVE phrasings of ONE concept, so coverage is ANY-match (OR) over
 * them — stem-tolerant, so an inflection counts. A corpus-side paraphrase in `expectedMarkers` does NOT
 * earn external (ATS) credit. (Distinct requirements are separate coverage items, so an "easy" term can't
 * mask a "hard" one — that separation is the planner's job, not an AND here.) Legacy maps without
 * `atsTerms` fall back to ANY-match over `expectedMarkers`.
 */
export function diffCoverage(
  map: CoverageMap,
  text: string,
): { covered: CoveragePlanItem[]; gaps: CoveragePlanItem[] } {
  const lower = text.toLowerCase();
  const words = lower.replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean);
  const covered: CoveragePlanItem[] = [];
  const gaps: CoveragePlanItem[] = [];
  for (const item of map) {
    if (!item.supportable) continue; // unsupportable requirements are not coverage gaps; they are suggestions
    const ats = (item.atsTerms ?? []).filter((m) => m.trim());
    const hit = ats.length
      ? ats.some((m) => termPresent(m, lower, words))
      : item.expectedMarkers.some((m) => m.trim() && lower.includes(m.toLowerCase()));
    (hit ? covered : gaps).push(item);
  }
  return { covered, gaps };
}
