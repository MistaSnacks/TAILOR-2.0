"use node";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getGenerator } from "./llm";

const VALID_TYPES = ["verbatim", "rephrase", "infer", "compose"];

/**
 * Generate one Fitting for a pasted job description (§3 steps 2–6).
 * Creates the job, runs the grounded generator, enforces the hard invariant
 * (every bullet cites ≥1 real evidence id — §7), scores fit (§9), saves it.
 *
 * v1 simplifications vs spec: single grounded pass (no separate cross-vendor
 * verifier §7, no §16 coverage loop yet). Grounding is enforced server-side.
 */
export const generateFitting = action({
  args: { title: v.string(), rawText: v.string() },
  handler: async (ctx, { title, rawText }): Promise<{ fittingId: string }> => {
    const jobId = await ctx.runMutation(internal.fittings.createJob, { title, rawText });

    const threads = await ctx.runQuery(api.form.listEvidence, {});
    const view = await ctx.runQuery(api.form.formView, {});
    const skills = view.skills.map((s) => s.name);
    const genThreads = threads.map((t) => ({ id: t._id as string, text: t.text }));
    const validIds = new Set(genThreads.map((t) => t.id));

    const gen = await getGenerator().generate(rawText, genThreads, skills);

    // Hard invariant (§7): drop any bullet with no real cited evidence.
    const bullets = (gen.bullets ?? [])
      .map((b) => ({
        text: b.text,
        type: VALID_TYPES.includes(b.type) ? b.type : "rephrase",
        evidenceIds: (b.evidenceIds ?? []).filter((id) => validIds.has(id)),
        ...(b.relationship ? { relationship: String(b.relationship) } : {}),
      }))
      .filter((b) => b.text && b.text.trim().length > 0 && b.evidenceIds.length > 0);

    // Fit score (§9): keyword coverage computed in code; requirement coverage
    // from the model's covered flags; format constant (single-column, ATS-safe).
    const resumeText = (gen.summary + " " + bullets.map((b) => b.text).join(" ")).toLowerCase();
    const keywords = (gen.keywords ?? []).filter((k) => typeof k === "string" && k.trim());
    const kwHits = keywords.filter((k) => resumeText.includes(k.toLowerCase())).length;
    const keyword = keywords.length ? Math.round((kwHits / keywords.length) * 100) : 0;
    const reqs = (gen.requirements ?? []).filter((r) => r && typeof r.text === "string" && r.text.trim());
    const reqCovered = reqs.filter((r) => r.covered).length;
    const requirement = reqs.length ? Math.round((reqCovered / reqs.length) * 100) : 0;
    const format = 96;
    const overall = Math.round(requirement * 0.4 + keyword * 0.35 + format * 0.25);

    const fittingId = await ctx.runMutation(internal.fittings.saveFitting, {
      jobId,
      summary: gen.summary ?? "",
      bullets,
      keywords,
      requirements: reqs.map((r) => ({ text: r.text, covered: !!r.covered })),
      fit: { overall, keyword, requirement, format },
    });
    return { fittingId: fittingId as string };
  },
});
