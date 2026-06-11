// convex/quality/coverage.ts
// Pure, LLM-free coverage diff for the §16 loop. No Convex/node imports.
import type { CoverageMap, CoveragePlanItem, GeneratedResume } from "../llm/types";

/** Flatten a draft to a single lowercased haystack: summary + all bullets + skills. */
export function draftText(d: GeneratedResume): string {
  const bullets = d.experiences.flatMap((e) => e.highlights.map((h) => h.text));
  return [d.summary, ...bullets, ...d.skills].join("\n").toLowerCase();
}

/** A supportable requirement is "covered" iff ANY of its expectedMarkers appears in the draft text. */
export function diffCoverage(
  map: CoverageMap,
  text: string,
): { covered: CoveragePlanItem[]; gaps: CoveragePlanItem[] } {
  const covered: CoveragePlanItem[] = [];
  const gaps: CoveragePlanItem[] = [];
  for (const item of map) {
    if (!item.supportable) continue; // unsupportable requirements are not coverage gaps; they are suggestions
    const hit = item.expectedMarkers.some((m) => m.trim() && text.includes(m.toLowerCase()));
    (hit ? covered : gaps).push(item);
  }
  return { covered, gaps };
}
