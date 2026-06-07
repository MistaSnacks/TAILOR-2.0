"use node";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getExtractor } from "./llm";

/**
 * Re-derive the whole Form from scratch: clear, re-extract every parsed doc
 * inline (sequential — no race), then a single canonicalize. Deterministic.
 */
export const reprocessAll = action({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.runQuery(api.documents.list);
    await ctx.runMutation(internal.form.clearForm, {});
    let docsProcessed = 0;
    for (const d of docs) {
      if (d.status === "parsed" && d.parsedText) {
        const evidence = await getExtractor().extract(d.parsedText);
        await ctx.runMutation(internal.form.addEvidence, { documentId: d._id, evidence });
        docsProcessed++;
      }
    }
    await ctx.scheduler.runAfter(0, internal.canonicalize.rebuild, {});
    return { docsProcessed };
  },
});

/** Extract evidence units from a parsed document, then trigger a Form rebuild. */
export const extractEvidence = internalAction({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runMutation(internal.documents.getDocument, { documentId });
    if (!doc?.parsedText) return;
    const evidence = await getExtractor().extract(doc.parsedText);
    await ctx.runMutation(internal.form.addEvidence, { documentId, evidence });
    await ctx.scheduler.runAfter(0, internal.canonicalize.rebuild, {});
  },
});
