"use node";
import { GoogleGenAI } from "@google/genai";
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

const MODEL = process.env.LLM_MODEL ?? "gemini-flash-latest"; // §18 = Gemini 3 Flash; override via LLM_MODEL
const client = () => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function jsonCall(system: string, user: string): Promise<unknown> {
  const res = await client().models.generateContent({
    model: MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0 },
  });
  return JSON.parse(res.text ?? "");
}

export class GeminiProfileBuilder implements ProfileBuilder {
  async build(documents: { filename: string; text: string }[]): Promise<CanonicalProfile> {
    return (await jsonCall(PROFILE_SYSTEM, JSON.stringify({ documents }))) as CanonicalProfile;
  }
}

export class GeminiGenerator implements Generator {
  async generate(jobText: string, profile: CanonicalProfile): Promise<GeneratedResume> {
    return (await jsonCall(GENERATION_SYSTEM, JSON.stringify({ jobDescription: jobText, profile }))) as GeneratedResume;
  }
}

export class GeminiVerifier implements Verifier {
  async verify(
    jobText: string,
    profile: CanonicalProfile,
    resume: GeneratedResume,
  ): Promise<VerificationReport> {
    return (await jsonCall(
      VERIFICATION_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, resume }),
    )) as VerificationReport;
  }
}

export class GeminiPlanner implements Planner {
  async plan(jobText: string, profile: CanonicalProfile): Promise<CoverageMap> {
    const out = (await jsonCall(PLANNER_SYSTEM, JSON.stringify({ jobDescription: jobText, profile }))) as { coverage?: CoverageMap };
    return Array.isArray(out?.coverage) ? out.coverage : [];
  }
}

export class GeminiReviser implements Reviser {
  async revise(
    jobText: string,
    profile: CanonicalProfile,
    draft: GeneratedResume,
    targets: string[],
  ): Promise<GeneratedResume> {
    return (await jsonCall(
      REVISE_SYSTEM,
      JSON.stringify({ jobDescription: jobText, profile, draft, targets }),
    )) as GeneratedResume;
  }
}
