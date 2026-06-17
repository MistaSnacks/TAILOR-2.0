import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const docStatus = v.union(
  v.literal("uploaded"),
  v.literal("parsed"),
  v.literal("failed"),
);

export default defineSchema({
  // The Cloth: one uploaded file.
  corpusDocuments: defineTable({
    filename: v.string(),
    mimeType: v.string(),
    storageId: v.optional(v.id("_storage")),
    status: docStatus,
    parsedText: v.optional(v.string()),
    error: v.optional(v.string()),
  }),

  // The Form (JSON Resume aligned). Single-user v1: one profile row (`basics`).
  profile: defineTable({
    name: v.optional(v.string()),
    label: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    url: v.optional(v.string()),
    summary: v.optional(v.string()),
    location: v.optional(v.string()),
    profiles: v.array(v.object({ network: v.string(), url: v.string() })),
  }),

  // One row per real job (deduped across documents). Bullets grouped here.
  experiences: defineTable({
    company: v.string(),
    position: v.string(),
    location: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    isCurrent: v.boolean(),
    highlights: v.array(v.string()),
    order: v.number(), // 0 = most recent (reverse-chronological)
  }),

  skills: defineTable({ name: v.string(), keywords: v.array(v.string()) }),

  education: defineTable({
    institution: v.string(),
    area: v.optional(v.string()),
    studyType: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  }),

  // The Pattern: a parsed job description.
  jobs: defineTable({ title: v.string(), rawText: v.string() }),

  // A Fitting: one tailored résumé for one Pattern, in a chosen ATS template.
  fittings: defineTable({
    jobId: v.id("jobs"),
    template: v.string(), // "classic" | "compact"
    summary: v.string(),
    experiences: v.array(
      v.object({
        company: v.string(),
        position: v.string(),
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        highlights: v.array(
          v.object({
            text: v.string(),
            type: v.string(),
            relationship: v.optional(v.string()),
          }),
        ),
      }),
    ),
    skills: v.array(v.string()),
    keywords: v.array(v.string()),
    requirements: v.array(v.object({ text: v.string(), covered: v.boolean() })),
    // Factual, sourced verbatim from the Form — never LLM-tailored. Optional for
    // backwards-compat with fittings generated before education was plumbed through.
    education: v.optional(
      v.array(
        v.object({
          institution: v.string(),
          area: v.optional(v.string()),
          studyType: v.optional(v.string()),
          startDate: v.optional(v.string()),
          endDate: v.optional(v.string()),
        }),
      ),
    ),
    // Stage-1 outcome: "not-ready" means the draft failed the gate and could not be
    // repaired within budget — Phase B shows a banner instead of a score. Optional for
    // backwards-compat with fittings saved before gate-repair.
    status: v.optional(v.union(v.literal("ready"), v.literal("not-ready"))),
    fit: v.object({
      overall: v.number(),
      keyword: v.number(),
      requirement: v.number(),
      format: v.number(),
      coverage: v.optional(v.number()),
      quality: v.optional(v.number()),
      transferability: v.optional(v.number()),
    }),
    gate: v.optional(
      v.object({
        pass: v.boolean(),
        truthfulness: v.boolean(),
        fidelity: v.boolean(),
        consistency: v.boolean(),
        blockingReasons: v.array(v.string()),
      }),
    ),
    bulletVerdicts: v.optional(
      v.array(
        v.object({
          text: v.string(),
          defensible: v.boolean(),
          evidence: v.optional(v.string()),
          reason: v.optional(v.string()),
        }),
      ),
    ),
    coverageMap: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          supportable: v.boolean(),
          evidenceRef: v.optional(v.string()),
          expectedMarkers: v.array(v.string()),
        }),
      ),
    ),
    rounds: v.optional(v.number()),
    improvementSuggestions: v.optional(
      v.array(
        v.object({
          requirement: v.string(),
          reason: v.union(v.literal("unsupportable"), v.literal("budget"), v.literal("gate-rejected")),
        }),
      ),
    ),
  }).index("by_job", ["jobId"]),
});
