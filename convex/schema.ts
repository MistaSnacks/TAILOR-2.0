import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Ingestion status for a single uploaded file (the "Bolt of cloth").
export const docStatus = v.union(
  v.literal("uploaded"),
  v.literal("parsed"),
  v.literal("failed"),
);

export default defineSchema({
  // The Cloth: one uploaded file. Raw bytes live in Convex storage (storageId).
  corpusDocuments: defineTable({
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
    status: docStatus,
    parsedText: v.optional(v.string()),
    error: v.optional(v.string()),
  }),

  // The Form — canonical roles (entity-resolution output).
  canonicalRoles: defineTable({
    employer: v.string(),
    title: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  }),

  // The Form — grouped skills (surface variants collapsed).
  canonicalSkills: defineTable({
    name: v.string(),
    variants: v.array(v.string()),
  }),

  // Thread: an atomic, deduped real claim.
  evidenceUnits: defineTable({
    text: v.string(),
    roleId: v.optional(v.id("canonicalRoles")),
  }).index("by_role", ["roleId"]),

  // Provenance: which document(s) a thread was pulled from (M:N — a merged
  // thread keeps every source link). The trust spine of §2/§6.
  evidenceProvenance: defineTable({
    evidenceId: v.id("evidenceUnits"),
    documentId: v.id("corpusDocuments"),
  })
    .index("by_evidence", ["evidenceId"])
    .index("by_document", ["documentId"]),
});
