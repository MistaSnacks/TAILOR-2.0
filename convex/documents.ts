import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** List corpus documents, newest first (ordered by _creationTime desc). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("corpusDocuments").order("desc").collect();
  },
});

/** Create one corpus document (metadata only in Plan 1) and return it. */
export const create = mutation({
  args: {
    filename: v.string(),
    mimeType: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.filename.trim().length === 0) {
      throw new Error("filename must not be empty");
    }
    const id = await ctx.db.insert("corpusDocuments", {
      filename: args.filename,
      mimeType: args.mimeType,
    });
    return await ctx.db.get(id);
  },
});
