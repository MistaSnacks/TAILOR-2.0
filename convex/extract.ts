"use node";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getExtractor } from "./llm";

/** Re-run extraction for every already-parsed document (e.g. after setting the key). */
export const reprocessAll = action({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.runQuery(api.documents.list);
    let scheduled = 0;
    for (const d of docs) {
      if (d.status === "parsed") {
        await ctx.scheduler.runAfter(0, internal.extract.extractEvidence, { documentId: d._id });
        scheduled++;
      }
    }
    return { scheduled };
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
