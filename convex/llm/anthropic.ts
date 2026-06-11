"use node";
// Alternate adapter. Provider-agnostic interfaces — swap via the factory's env switch.
import Anthropic from "@anthropic-ai/sdk";
import {
  GENERATION_SYSTEM,
  PLANNER_SYSTEM,
  PROFILE_SYSTEM,
  REVISE_SYSTEM,
  VERIFICATION_SYSTEM,
  type CanonicalProfile,
  type CoverageMap,
  type GeneratedResume,
  type Generator,
  type Planner,
  type ProfileBuilder,
  type Reviser,
  type Verifier,
  type VerificationReport,
} from "./types";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001";

function jsonFrom(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("no JSON found in model output");
  return JSON.parse(match[0]);
}

async function call(system: string, user: string): Promise<unknown> {
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = res.content.find((b) => b.type === "text");
  return jsonFrom(block && "text" in block ? block.text : "{}");
}

export class ClaudeProfileBuilder implements ProfileBuilder {
  async build(documents: { filename: string; text: string }[]): Promise<CanonicalProfile> {
    return (await call(PROFILE_SYSTEM, JSON.stringify({ documents }))) as CanonicalProfile;
  }
}

export class ClaudeGenerator implements Generator {
  async generate(jobText: string, profile: CanonicalProfile): Promise<GeneratedResume> {
    return (await call(GENERATION_SYSTEM, JSON.stringify({ jobDescription: jobText, profile }))) as GeneratedResume;
  }
}

export class ClaudeVerifier implements Verifier {
  async verify(
    jobText: string,
    profile: CanonicalProfile,
    resume: GeneratedResume,
  ): Promise<VerificationReport> {
    return (await call(
      VERIFICATION_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, resume }),
    )) as VerificationReport;
  }
}

export class ClaudePlanner implements Planner {
  async plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap> {
    const out = (await call(PLANNER_SYSTEM, JSON.stringify({ jobDescription: jobText, profile }))) as { coverage?: CoverageMap };
    return Array.isArray(out?.coverage) ? out.coverage : [];
  }
}

export class ClaudeReviser implements Reviser {
  async revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
  ): Promise<GeneratedResume> {
    return (await call(
      REVISE_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, draft, targets }),
    )) as GeneratedResume;
  }
}
