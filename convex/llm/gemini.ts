"use node";
import { GoogleGenAI } from "@google/genai";
import {
  GENERATION_SYSTEM,
  PLANNER_SYSTEM,
  PROFILE_SYSTEM,
  REPAIR_SYSTEM,
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

/**
 * Return the first COMPLETE, balanced JSON value (object/array) in `text`, string-aware so braces
 * inside strings don't miscount. Tolerates leading/trailing prose or a second object the model
 * occasionally appends even in JSON mode (the cause of "Unexpected non-whitespace character after JSON").
 */
function firstJsonValue(text: string): string {
  let i = 0;
  while (i < text.length && text[i] !== "{" && text[i] !== "[") i++;
  if (i >= text.length) throw new Error("no JSON value in model output");
  const open = text[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(i, j + 1);
  }
  throw new Error("unterminated JSON value in model output");
}

async function jsonCall(system: string, user: string): Promise<unknown> {
  const res = await client().models.generateContent({
    model: MODEL,
    contents: user,
    config: { systemInstruction: system, responseMimeType: "application/json", temperature: 0 },
  });
  const text = res.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(firstJsonValue(text)); // strip any trailing content the model appended
  }
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
    mode: "coverage" | "repair" = "coverage",
  ): Promise<GeneratedResume> {
    const system = mode === "repair" ? REPAIR_SYSTEM : REVISE_SYSTEM;
    const payload = mode === "repair"
      ? { jobDescription: jobText, profile, draft, issues: targets }
      : { jobDescription: jobText, profile, draft, targets };
    return (await jsonCall(system, JSON.stringify(payload))) as GeneratedResume;
  }
}
