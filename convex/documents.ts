import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

/** List corpus documents, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("corpusDocuments").order("desc").collect(),
});

/** Step 1 of upload: hand the client a short-lived URL to POST file bytes to. */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

/**
 * Step 2 of upload: record the document row (status "uploaded").
 * `storageId` is optional so non-file callers/tests can omit it.
 * (Parsing is scheduled in P2-T4, once parse.ts exists.)
 */
export const recordDocument = mutation({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.filename.trim().length === 0) {
      throw new Error("filename must not be empty");
    }
    return await ctx.db.insert("corpusDocuments", {
      filename: args.filename,
      mimeType: args.mimeType,
      storageId: args.storageId,
      status: "uploaded",
    });
  },
});

/** Mark a document parsed and store its clean text. */
export const setParsed = internalMutation({
  args: { documentId: v.id("corpusDocuments"), parsedText: v.string() },
  handler: async (ctx, { documentId, parsedText }) => {
    await ctx.db.patch(documentId, { status: "parsed", parsedText, error: undefined });
  },
});

/** Mark a document failed but keep the row so the rest of the corpus survives (§13). */
export const setFailed = internalMutation({
  args: { documentId: v.id("corpusDocuments"), error: v.string() },
  handler: async (ctx, { documentId, error }) => {
    await ctx.db.patch(documentId, { status: "failed", error });
  },
});

/** Internal getter used by the parse/extract actions. */
export const getDocument = internalMutation({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => ctx.db.get(documentId),
});
