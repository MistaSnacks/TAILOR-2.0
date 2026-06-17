import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const createJob = internalMutation({
  args: { title: v.string(), rawText: v.string() },
  handler: async (ctx, a) => ctx.db.insert("jobs", { title: a.title || "Untitled role", rawText: a.rawText }),
});

const expV = v.object({
  company: v.string(),
  position: v.string(),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  highlights: v.array(
    v.object({ text: v.string(), type: v.string(), relationship: v.optional(v.string()) }),
  ),
});

const eduV = v.object({
  institution: v.string(),
  area: v.optional(v.string()),
  studyType: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
});

export const saveFitting = internalMutation({
  args: {
    jobId: v.id("jobs"),
    template: v.string(),
    summary: v.string(),
    experiences: v.array(expV),
    skills: v.array(v.string()),
    keywords: v.array(v.string()),
    requirements: v.array(v.object({ text: v.string(), covered: v.boolean() })),
    education: v.optional(v.array(eduV)),
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
  },
  handler: async (ctx, args) => ctx.db.insert("fittings", args),
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => ctx.db.query("jobs").order("desc").collect(),
});

export const listFittings = query({
  args: {},
  handler: async (ctx) => {
    const fittings = await ctx.db.query("fittings").order("desc").collect();
    const out = [];
    for (const f of fittings) {
      const job = await ctx.db.get(f.jobId);
      const bulletCount = f.experiences.reduce((n, e) => n + e.highlights.length, 0);
      out.push({ id: f._id, title: job?.title ?? "—", overall: f.fit.overall, bulletCount, createdAt: f._creationTime });
    }
    return out;
  },
});

export const getFitting = query({
  args: { fittingId: v.id("fittings") },
  handler: async (ctx, { fittingId }) => {
    const f = await ctx.db.get(fittingId);
    if (!f) return null;
    const job = await ctx.db.get(f.jobId);
    return {
      id: f._id,
      title: job?.title ?? "—",
      template: f.template,
      summary: f.summary,
      experiences: f.experiences,
      skills: f.skills,
      keywords: f.keywords,
      requirements: f.requirements,
      education: f.education ?? [],
      status: f.status ?? "ready",
      fit: f.fit,
      gate: f.gate ?? null,
      bulletVerdicts: f.bulletVerdicts ?? [],
      coverageMap: f.coverageMap ?? [],
      rounds: f.rounds ?? 0,
      improvementSuggestions: f.improvementSuggestions ?? [],
    };
  },
});
