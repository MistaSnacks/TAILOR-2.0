"use node";
import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { getCanonicalizer } from "./llm";

/** Recompute the Form from all current evidence (§4). */
export const rebuild = internalAction({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.runQuery(api.form.listEvidence, {});
    if (units.length === 0) {
      // Nothing left — clear roles/skills/threads so the Form reflects an empty corpus.
      await ctx.runMutation(internal.form.rebuildForm, {
        evidenceOrder: [],
        result: { threads: [], roles: [], skills: [] },
      });
      return;
    }
    const evidenceOrder = units.map((u) => u._id);
    const raw = await getCanonicalizer().canonicalize(units.map((u) => ({ text: u.text })));
    // Models return `null` for absent optional fields; Convex optional validators
    // accept `undefined`, not `null` — so strip nulls before persisting.
    // Models return null / drop fields unpredictably. Be fully defensive: drop
    // malformed entries and strip nulls so Convex's validators never reject the batch.
    const result = {
      threads: (raw.threads ?? [])
        .filter((t) => t && typeof t.text === "string" && t.text.trim().length > 0)
        .map((t) => ({
          text: t.text,
          sourceIndices: Array.isArray(t.sourceIndices) ? t.sourceIndices.filter((n) => typeof n === "number") : [],
          ...(t.employer ? { employer: t.employer } : {}),
          ...(t.title ? { title: t.title } : {}),
        })),
      roles: (raw.roles ?? [])
        .filter((r) => r && r.employer && r.title)
        .map((r) => ({
          employer: r.employer,
          title: r.title,
          ...(r.startDate ? { startDate: r.startDate } : {}),
          ...(r.endDate ? { endDate: r.endDate } : {}),
        })),
      skills: (raw.skills ?? [])
        .filter((s) => s && s.name)
        .map((s) => ({ name: s.name, variants: Array.isArray(s.variants) ? s.variants.filter((x) => typeof x === "string") : [] })),
    };
    await ctx.runMutation(internal.form.rebuildForm, { evidenceOrder, result });
  },
});
