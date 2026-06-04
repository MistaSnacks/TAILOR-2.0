"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
// pdf-parse + mammoth are marked external in convex.json so Convex installs
// them in the Node runtime instead of bundling (they have dynamic deps).
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { extractText } from "./parsing/extractText";

/** Read a stored file, extract text, and write it back. Never throws past §13. */
export const parseDocument = internalAction({
  args: { documentId: v.id("corpusDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.runMutation(internal.documents.getDocument, { documentId });
    if (!doc || !doc.storageId) {
      await ctx.runMutation(internal.documents.setFailed, { documentId, error: "no stored file" });
      return;
    }
    try {
      const blob = await ctx.storage.get(doc.storageId);
      if (!blob) throw new Error("file missing from storage");
      const bytes = await blob.arrayBuffer();
      const text = await extractText(doc.mimeType, bytes, {
        pdf: async (buf) => {
          const parser = new PDFParse({ data: buf });
          try {
            const r = await parser.getText();
            return { text: r.text };
          } finally {
            await parser.destroy();
          }
        },
        docx: async ({ buffer }) => mammoth.extractRawText({ buffer }),
      });
      if (text.length === 0) throw new Error("empty after parse");
      await ctx.runMutation(internal.documents.setParsed, { documentId, parsedText: text });
      // P2-T7 adds: schedule extract here.
    } catch (e) {
      await ctx.runMutation(internal.documents.setFailed, {
        documentId,
        error: e instanceof Error ? e.message : "parse failed",
      });
    }
  },
});
