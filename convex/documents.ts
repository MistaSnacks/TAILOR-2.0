import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("corpusDocuments").order("desc").collect(),
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const recordDocument = mutation({
  args: {
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    if (args.filename.trim().length === 0) throw new Error("filename must not be empty");
    const documentId = await ctx.db.insert("corpusDocuments", {
      filename: args.filename,
      mimeType: args.mimeType,
      storageId: args.storageId,
      status: "uploaded",
    });
    if (args.storageId) {
      await ctx.scheduler.runAfter(0, internal.parse.parseDocument, { documentId });
    }
    return documentId;
  },
});

export const setParsed = internalMutation({
  args: { documentId: v.id("corpusDocuments"), parsedText: v.string() },
  handler: async (ctx, { documentId, parsedText }) => {
    await ctx.db.patch(documentId, { status: "parsed", parsedText, error: undefined });
  },
});

export const setFailed = internalMutation({
  args: { documentId: v.id("corpusDocuments"), error: v.string() },
  handler: async (ctx, { documentId, error }) => {
    await ctx.db.patch(documentId, { status: "failed", error });
  },
});

export const getDocument = internalMutation({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => ctx.db.get(documentId),
});

/** Delete a document + its stored file, then re-canonicalize the Form from what remains. */
export const deleteDocument = mutation({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc) return;
    if (doc.storageId) await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(documentId);
    await ctx.scheduler.runAfter(0, internal.canonicalize.buildProfile, {});
  },
});
