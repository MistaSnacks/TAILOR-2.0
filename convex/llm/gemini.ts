"use node";
import { GoogleGenAI } from "@google/genai";
import {
  GENERATION_SYSTEM,
  PROFILE_SYSTEM,
  type CanonicalProfile,
  type GeneratedResume,
  type Generator,
  type ProfileBuilder,
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
