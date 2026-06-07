import { query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

const basicsV = v.object({
  name: v.optional(v.string()),
  label: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  url: v.optional(v.string()),
  summary: v.optional(v.string()),
  location: v.optional(v.string()),
  profiles: v.array(v.object({ network: v.string(), url: v.string() })),
});
const experienceV = v.object({
  company: v.string(),
  position: v.string(),
  location: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
  isCurrent: v.boolean(),
  highlights: v.array(v.string()),
});
const skillV = v.object({ name: v.string(), keywords: v.array(v.string()) });
const educationV = v.object({
  institution: v.string(),
  area: v.optional(v.string()),
  studyType: v.optional(v.string()),
  startDate: v.optional(v.string()),
  endDate: v.optional(v.string()),
});

export const clearProfile = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const t of ["profile", "experiences", "skills", "education"] as const) {
      for (const r of await ctx.db.query(t).collect()) await ctx.db.delete(r._id);
    }
  },
});

/** Replace the whole Form with a freshly-canonicalized structured profile. */
export const setProfile = internalMutation({
  args: {
    profile: v.object({
      basics: basicsV,
      experiences: v.array(experienceV),
      skills: v.array(skillV),
      education: v.array(educationV),
    }),
  },
  handler: async (ctx, { profile }) => {
    for (const t of ["profile", "experiences", "skills", "education"] as const) {
      for (const r of await ctx.db.query(t).collect()) await ctx.db.delete(r._id);
    }
    await ctx.db.insert("profile", profile.basics);
    let order = 0;
    for (const e of profile.experiences) await ctx.db.insert("experiences", { ...e, order: order++ });
    for (const s of profile.skills) await ctx.db.insert("skills", s);
    for (const ed of profile.education) await ctx.db.insert("education", ed);
  },
});

/** The Form view: contact basics + reverse-chronological experiences + skills + education. */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const basics = await ctx.db.query("profile").first();
    const experiences = (await ctx.db.query("experiences").collect()).sort((a, b) => a.order - b.order);
    const skills = await ctx.db.query("skills").collect();
    const education = await ctx.db.query("education").collect();
    return { basics: basics ?? null, experiences, skills, education };
  },
});
