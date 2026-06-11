// convex/quality/select.ts
// Pure, minimal §17 selector. Ships a room-at-cap stub; full density-greedy
// swap (evict a lower-priority bullet to fit a higher-priority gap) is deferred
// (see docs/specs/2026-06-11-coverage-loop-design.md §10). No Convex/node imports.
import type { GeneratedResume, CoveragePlanItem } from "../llm/types";

export const BUDGET = { maxBullets: 18, maxPerRole: 6 } as const;

export function totalBullets(d: GeneratedResume): number {
  return d.experiences.reduce((n, e) => n + e.highlights.length, 0);
}

/**
 * Can the draft accommodate a bullet that closes `gap` within the length budget?
 * STUB: true iff the draft is under the total bullet cap (there is room to add).
 * `gap` is accepted for the eventual density-greedy swap signature but unused today.
 */
export function fitsWithinBudget(draft: GeneratedResume, _gap: CoveragePlanItem): boolean {
  return totalBullets(draft) < BUDGET.maxBullets;
}
