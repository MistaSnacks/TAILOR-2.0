"use node";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { getProfileBuilder } from "./llm";

const s = (x: unknown): string | undefined =>
  typeof x === "string" && x.trim().length > 0 ? x : undefined;

/** Canonicalize ALL parsed documents into one structured, deduped profile (§4). */
export const buildProfile = internalAction({
  args: {},
  handler: async (ctx) => {
    const docs = await ctx.runQuery(api.documents.list);
    const parsed = docs
      .filter((d) => d.status === "parsed" && d.parsedText)
      .map((d) => ({ filename: d.filename, text: d.parsedText as string }));
    if (parsed.length === 0) {
      await ctx.runMutation(internal.profile.clearProfile, {});
      return;
    }
    const raw = await getProfileBuilder().build(parsed);
    const b = raw.basics ?? { profiles: [] };

    // Sanitize: strip nulls, drop malformed entries (models return null/garbage).
    const profile = {
      basics: {
        ...(s(b.name) ? { name: b.name } : {}),
        ...(s(b.label) ? { label: b.label } : {}),
        ...(s(b.email) ? { email: b.email } : {}),
        ...(s(b.phone) ? { phone: b.phone } : {}),
        ...(s(b.url) ? { url: b.url } : {}),
        ...(s(b.summary) ? { summary: b.summary } : {}),
        ...(s(b.location) ? { location: b.location } : {}),
        profiles: (b.profiles ?? [])
          .filter((p) => p && p.network && p.url)
          .map((p) => ({ network: p.network, url: p.url })),
      },
      experiences: (raw.experiences ?? [])
        .filter((e) => e && e.company && e.position)
        .map((e) => ({
          company: e.company,
          position: e.position,
          ...(s(e.location) ? { location: e.location } : {}),
          ...(s(e.startDate) ? { startDate: e.startDate } : {}),
          ...(s(e.endDate) ? { endDate: e.endDate } : {}),
          isCurrent: !!e.isCurrent,
          highlights: (e.highlights ?? []).filter((h) => typeof h === "string" && h.trim().length > 0),
        })),
      skills: (raw.skills ?? [])
        .filter((sk) => sk && sk.name)
        .map((sk) => ({
          name: sk.name,
          keywords: (sk.keywords ?? []).filter((k) => typeof k === "string" && k.trim().length > 0),
        })),
      education: (raw.education ?? [])
        .filter((ed) => ed && ed.institution)
        .map((ed) => ({
          institution: ed.institution,
          ...(s(ed.area) ? { area: ed.area } : {}),
          ...(s(ed.studyType) ? { studyType: ed.studyType } : {}),
          ...(s(ed.startDate) ? { startDate: ed.startDate } : {}),
          ...(s(ed.endDate) ? { endDate: ed.endDate } : {}),
        })),
    };
    await ctx.runMutation(internal.profile.setProfile, { profile });
  },
});

/** Manually rebuild the Form from current cloth (UI "Rebuild Form" button). */
export const reprocessAll = action({
  args: {},
  handler: async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.canonicalize.buildProfile, {});
    return { ok: true };
  },
});
