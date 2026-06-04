"use node";
import { internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { getCanonicalizer } from "./llm";

/** Recompute the Form from all current evidence (§4). */
export const rebuild = internalAction({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.runQuery(api.form.listEvidence, {});
    if (units.length === 0) return;
    const evidenceOrder = units.map((u) => u._id);
    const result = await getCanonicalizer().canonicalize(units.map((u) => ({ text: u.text })));
    await ctx.runMutation(internal.form.rebuildForm, { evidenceOrder, result });
  },
});
