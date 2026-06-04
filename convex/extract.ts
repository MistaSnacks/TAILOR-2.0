"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getExtractor } from "./llm";

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
