import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The `v` validators ARE the data contract — the single source of truth for
// document shapes, shared by the backend (enforced at write time) and the
// frontend (via convex/_generated/dataModel). Convex auto-adds `_id` and
// `_creationTime` to every row.
export default defineSchema({
  corpusDocuments: defineTable({
    filename: v.string(),
    mimeType: v.string(),
  }),
});
