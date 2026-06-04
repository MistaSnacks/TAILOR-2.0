"use node";
import { GoogleGenAI } from "@google/genai";
import type { Canonicalizer, CanonicalResult, Extractor, RawEvidence } from "./types";

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

export class GeminiExtractor implements Extractor {
  async extract(documentText: string): Promise<RawEvidence[]> {
    const arr = (await jsonCall(
      "Extract atomic, factual claims from this resume/career document. Each claim is one real thing the person did — no inference, no embellishment. Return a JSON array: [{\"text\": \"...\"}].",
      documentText,
    )) as RawEvidence[];
    return (arr ?? []).filter((e) => e?.text?.trim());
  }
}

export class GeminiCanonicalizer implements Canonicalizer {
  async canonicalize(evidence: { text: string }[]): Promise<CanonicalResult> {
    return (await jsonCall(
      "Canonicalize a career corpus (§4). Given many evidence units (some restate the same fact across documents): (1) merge restatements into one thread, recording the 0-based input indices it merges; (2) resolve roles (employer/title/dates); (3) group skill surface-variants. ONLY organize — never add facts. Return JSON {\"threads\":[{\"text\",\"sourceIndices\":[],\"employer?\",\"title?\"}],\"roles\":[{\"employer\",\"title\",\"startDate?\",\"endDate?\"}],\"skills\":[{\"name\",\"variants\":[]}]}.",
      JSON.stringify(evidence.map((e, i) => ({ i, text: e.text }))),
    )) as CanonicalResult;
  }
}
