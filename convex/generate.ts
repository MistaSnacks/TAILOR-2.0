"use node";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { getGenerator, getVerifier, getPlanner, getReviser } from "./llm";
import type { CanonicalProfile } from "./llm";
import { runCoverageLoop } from "./quality/loop";
import { scoreDeterministic, type ScorableResume } from "./quality/rubric";
import { buildQualityVerdict } from "./quality/score";

const VALID = ["verbatim", "rephrase", "infer", "compose"];

/**
 * Generate one Fitting for a pasted JD against the structured profile (§3, §5–§9).
 * Grounded generation + an independent cross-vendor verifier (§7) that adjudicates
 * the truthfulness/fidelity/consistency hard gates and grades coverage.
 * Runs the §16 bounded coverage loop (plan → generate → diff → targeted revise → fixed point)
 * with an independent cross-vendor verifier (§7) gating every round; genuine gaps are persisted
 * as improvementSuggestions. Full §17 selection (density-greedy swap) is still a follow-on.
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

    // §16 bounded coverage loop: plan → generate → diff → revise → fixed point.
    const loop = await runCoverageLoop({
      jobText: rawText,
      profile: canonical,
      planner: getPlanner(),
      generator: getGenerator(),
      reviser: getReviser(),
      verifier: getVerifier(),
    });
    const gen = loop.draft;
    const verification = loop.verification;

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

    // Deterministic rubric over the cleaned, ACCEPTED résumé.
    const scorable: ScorableResume = {
      summary: gen.summary ?? "",
      experiences: experiences.map((e) => ({ highlights: e.highlights.map((h) => ({ text: h.text })) })),
      skills,
    };
    const deterministic = scoreDeterministic(scorable);
    const verdict = buildQualityVerdict(deterministic, verification);

    // Legacy sub-scores retained for the existing UI.
    const keywords = (gen.keywords ?? []).filter((k) => typeof k === "string" && k.trim());
    const reqs = (gen.requirements ?? []).filter((r) => r && typeof r.text === "string" && r.text.trim());
    const requirement = reqs.length
      ? Math.round((reqs.filter((r) => r.covered).length / reqs.length) * 100)
      : 0;
    const allText = (
      gen.summary + " " +
      experiences.flatMap((e) => e.highlights.map((h) => h.text)).join(" ") + " " +
      skills.join(" ")
    ).toLowerCase();
    const kwHits = keywords.filter((k) => allText.includes(k.toLowerCase())).length;
    const keyword = keywords.length ? Math.round((kwHits / keywords.length) * 100) : 0;

    const fittingId = await ctx.runMutation(internal.fittings.saveFitting, {
      jobId,
      template: template === "compact" ? "compact" : "classic",
      summary: gen.summary ?? "",
      experiences,
      skills,
      keywords,
      requirements: reqs.map((r) => ({ text: r.text, covered: !!r.covered })),
      fit: {
        overall: verdict.fit.overall,
        keyword,
        requirement,
        format: deterministic.score, // rubric score replaces the hardcoded 96
        coverage: verdict.fit.coverage,
        quality: verdict.fit.quality,
        transferability: verdict.fit.transferability,
      },
      gate: {
        pass: verdict.gatePass,
        truthfulness: verdict.gates.truthfulness,
        fidelity: verdict.gates.fidelity,
        consistency: verdict.gates.consistency,
        blockingReasons: verdict.blockingReasons,
      },
      bulletVerdicts: verification.bulletVerdicts,
      coverageMap: loop.coverageMap,
      rounds: loop.rounds,
      improvementSuggestions: loop.improvementSuggestions,
    });
    return { fittingId: fittingId as string };
  },
});
