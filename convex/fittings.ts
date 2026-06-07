import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

export const createJob = internalMutation({
  args: { title: v.string(), rawText: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("jobs", { title: args.title || "Untitled role", rawText: args.rawText }),
});

const bulletValidator = v.object({
  text: v.string(),
  type: v.string(),
  evidenceIds: v.array(v.string()),
  relationship: v.optional(v.string()),
});

export const saveFitting = internalMutation({
  args: {
    jobId: v.id("jobs"),
    summary: v.string(),
    bullets: v.array(bulletValidator),
    keywords: v.array(v.string()),
    requirements: v.array(v.object({ text: v.string(), covered: v.boolean() })),
    fit: v.object({
      overall: v.number(),
      keyword: v.number(),
      requirement: v.number(),
      format: v.number(),
    }),
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
      out.push({
        id: f._id,
        title: job?.title ?? "—",
        overall: f.fit.overall,
        bulletCount: f.bullets.length,
        createdAt: f._creationTime,
      });
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
    // Enrich each bullet with the text of the threads it cites — the trust trace.
    const bullets = [];
    for (const b of f.bullets) {
      const grounds: string[] = [];
      for (const id of b.evidenceIds) {
        const u = await ctx.db.get(id as Id<"evidenceUnits">);
        if (u && "text" in u) grounds.push(u.text);
      }
      bullets.push({ ...b, grounds });
    }
    return {
      id: f._id,
      title: job?.title ?? "—",
      summary: f.summary,
      bullets,
      keywords: f.keywords,
      requirements: f.requirements,
      fit: f.fit,
    };
  },
});
