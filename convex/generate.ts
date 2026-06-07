"use node";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getGenerator } from "./llm";
import type { CanonicalProfile } from "./llm";

const VALID = ["verbatim", "rephrase", "infer", "compose"];

/**
 * Generate one Fitting for a pasted JD against the structured profile (§3, §5–§9).
 * v1 simplifications vs spec: single grounded pass (no separate cross-vendor
 * verifier §7, no §16 coverage loop). The generator is constrained to the profile.
 */
export const generateFitting = action({
  args: { title: v.string(), rawText: v.string(), template: v.optional(v.string()) },
  handler: async (ctx, { title, rawText, template }): Promise<{ fittingId: string }> => {
    const jobId = await ctx.runMutation(internal.fittings.createJob, { title, rawText });
    const p = await ctx.runQuery(api.profile.getProfile, {});

    const canonical: CanonicalProfile = {
      basics: {
        name: p.basics?.name,
        label: p.basics?.label,
        email: p.basics?.email,
        phone: p.basics?.phone,
        url: p.basics?.url,
        summary: p.basics?.summary,
        location: p.basics?.location,
        profiles: p.basics?.profiles ?? [],
      },
      experiences: p.experiences.map((e) => ({
        company: e.company,
        position: e.position,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: e.isCurrent,
        highlights: e.highlights,
      })),
      skills: p.skills.map((sk) => ({ name: sk.name, keywords: sk.keywords })),
      education: p.education.map((ed) => ({
        institution: ed.institution,
        area: ed.area,
        studyType: ed.studyType,
        startDate: ed.startDate,
        endDate: ed.endDate,
      })),
    };

    const gen = await getGenerator().generate(rawText, canonical);

    const experiences = (gen.experiences ?? [])
      .filter((e) => e && e.company)
      .map((e) => ({
        company: e.company,
        position: e.position ?? "",
        ...(e.startDate ? { startDate: e.startDate } : {}),
        ...(e.endDate ? { endDate: e.endDate } : {}),
        highlights: (e.highlights ?? [])
          .filter((h) => h && typeof h.text === "string" && h.text.trim().length > 0)
          .map((h) => ({
            text: h.text,
            type: VALID.includes(h.type) ? h.type : "rephrase",
            ...(h.relationship ? { relationship: String(h.relationship) } : {}),
          })),
      }))
      .filter((e) => e.highlights.length > 0);

    const skills = (gen.skills ?? []).filter((sk) => typeof sk === "string" && sk.trim());
    const allText = (
      gen.summary +
      " " +
      experiences.flatMap((e) => e.highlights.map((h) => h.text)).join(" ") +
      " " +
      skills.join(" ")
    ).toLowerCase();
    const keywords = (gen.keywords ?? []).filter((k) => typeof k === "string" && k.trim());
    const kwHits = keywords.filter((k) => allText.includes(k.toLowerCase())).length;
    const keyword = keywords.length ? Math.round((kwHits / keywords.length) * 100) : 0;
    const reqs = (gen.requirements ?? []).filter((r) => r && typeof r.text === "string" && r.text.trim());
    const requirement = reqs.length ? Math.round((reqs.filter((r) => r.covered).length / reqs.length) * 100) : 0;
    const format = 96;
    const overall = Math.round(requirement * 0.4 + keyword * 0.35 + format * 0.25);

    const fittingId = await ctx.runMutation(internal.fittings.saveFitting, {
      jobId,
      template: template === "compact" ? "compact" : "classic",
      summary: gen.summary ?? "",
      experiences,
      skills,
      keywords,
      requirements: reqs.map((r) => ({ text: r.text, covered: !!r.covered })),
      fit: { overall, keyword, requirement, format },
    });
    return { fittingId: fittingId as string };
  },
});
