import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/** All threads, for FormExplorer + tests. */
export const listEvidence = query({
  args: {},
  handler: async (ctx) => ctx.db.query("evidenceUnits").collect(),
});

/** Thread ids in stable creation order — lets a caller map LLM indices → ids. */
export const evidenceIds = query({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.db.query("evidenceUnits").collect();
    return units.map((u) => u._id);
  },
});

/** FormExplorer view: each thread with its source filenames, plus grouped skills. */
export const formView = query({
  args: {},
  handler: async (ctx) => {
    const units = await ctx.db.query("evidenceUnits").collect();
    const threads = [];
    for (const u of units) {
      const edges = await ctx.db
        .query("evidenceProvenance")
        .withIndex("by_evidence", (q) => q.eq("evidenceId", u._id))
        .collect();
      const sources: string[] = [];
      for (const e of edges) {
        const doc = await ctx.db.get(e.documentId);
        if (doc) sources.push(doc.filename);
      }
      threads.push({ id: u._id, text: u.text, sources });
    }
    const skills = (await ctx.db.query("canonicalSkills").collect()).map((s) => ({
      name: s.name,
      variants: s.variants,
    }));
    return { threads, skills };
  },
});

/** Insert raw evidence for one document, each with a provenance edge. */
export const addEvidence = internalMutation({
  args: {
    documentId: v.id("corpusDocuments"),
    evidence: v.array(v.object({ text: v.string() })),
  },
  handler: async (ctx, { documentId, evidence }) => {
    for (const e of evidence) {
      const evidenceId = await ctx.db.insert("evidenceUnits", { text: e.text });
      await ctx.db.insert("evidenceProvenance", { evidenceId, documentId });
    }
  },
});

/** Wipe all derived Form state (threads, provenance, roles, skills). */
export const clearForm = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["evidenceProvenance", "evidenceUnits", "canonicalRoles", "canonicalSkills"] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }
  },
});

/**
 * Rebuild the Form from a Canonicalizer result. Replaces threads/roles/skills
 * with the merged set, preserving provenance by unioning the source threads'
 * documents onto each merged thread. `evidenceOrder` maps the canonicalizer's
 * 0-based input indices to the pre-merge evidenceUnit ids.
 */
export const rebuildForm = internalMutation({
  args: {
    evidenceOrder: v.array(v.id("evidenceUnits")),
    result: v.object({
      threads: v.array(
        v.object({
          text: v.string(),
          sourceIndices: v.array(v.number()),
          employer: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
      roles: v.array(
        v.object({
          employer: v.string(),
          title: v.string(),
          startDate: v.optional(v.string()),
          endDate: v.optional(v.string()),
        }),
      ),
      skills: v.array(v.object({ name: v.string(), variants: v.array(v.string()) })),
    }),
  },
  handler: async (ctx, { evidenceOrder, result }) => {
    // 1. Snapshot provenance of the pre-merge threads, keyed by their id.
    const oldProv = new Map<string, Set<Id<"corpusDocuments">>>();
    for (const evidenceId of evidenceOrder) {
      const edges = await ctx.db
        .query("evidenceProvenance")
        .withIndex("by_evidence", (q) => q.eq("evidenceId", evidenceId))
        .collect();
      oldProv.set(evidenceId, new Set(edges.map((e) => e.documentId)));
    }
    // 2. Wipe old threads, provenance, roles, skills.
    for (const table of ["evidenceProvenance", "evidenceUnits", "canonicalRoles", "canonicalSkills"] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }
    // 3. Write canonical roles + skills.
    const roleIdByKey = new Map<string, Id<"canonicalRoles">>();
    for (const r of result.roles) {
      const id = await ctx.db.insert("canonicalRoles", r);
      roleIdByKey.set(`${r.employer}|${r.title}`, id);
    }
    for (const s of result.skills) await ctx.db.insert("canonicalSkills", s);
    // 4. Write merged threads, unioning source-document provenance onto each.
    for (const th of result.threads) {
      const roleId = th.employer && th.title ? roleIdByKey.get(`${th.employer}|${th.title}`) : undefined;
      const evidenceId = await ctx.db.insert("evidenceUnits", { text: th.text, roleId });
      const docs = new Set<Id<"corpusDocuments">>();
      for (const idx of th.sourceIndices) {
        const oldId = evidenceOrder[idx];
        for (const d of oldProv.get(oldId) ?? []) docs.add(d);
      }
      for (const documentId of docs) await ctx.db.insert("evidenceProvenance", { evidenceId, documentId });
    }
  },
});
