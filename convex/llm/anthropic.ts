"use node";
// Alternate adapter. The interfaces are provider-agnostic, so swapping providers
// is this file + the factory's env switch only.
import Anthropic from "@anthropic-ai/sdk";
import type { Canonicalizer, CanonicalResult, Extractor, RawEvidence } from "./types";

const client = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.LLM_MODEL ?? "claude-haiku-4-5-20251001"; // cheap, structured-output capable

function jsonFrom(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!match) throw new Error("no JSON found in model output");
  return JSON.parse(match[0]);
}

export class ClaudeExtractor implements Extractor {
  async extract(documentText: string): Promise<RawEvidence[]> {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      system:
        "Extract atomic, factual claims from this resume/career document. " +
        "Each claim is one real thing the person did — no inference, no embellishment. " +
        'Return ONLY a JSON array of objects: [{"text": "..."}].',
      messages: [{ role: "user", content: documentText }],
    });
    const block = res.content.find((b) => b.type === "text");
    const arr = jsonFrom(block && "text" in block ? block.text : "[]") as RawEvidence[];
    return (arr ?? []).filter((e) => e?.text?.trim());
  }
}

export class ClaudeCanonicalizer implements Canonicalizer {
  async canonicalize(evidence: { text: string }[]): Promise<CanonicalResult> {
    const res = await client().messages.create({
      model: MODEL,
      max_tokens: 8192,
      system:
        "You are canonicalizing a career corpus (§4). Given many evidence units " +
        "(some are restatements of the same fact across documents), produce the Form: " +
        "(1) merge restatements into one thread, recording the 0-based input indices it merges; " +
        "(2) resolve roles (employer/title/dates); (3) group skill surface-variants. " +
        "ONLY organize — never add facts. Return ONLY JSON: " +
        '{"threads":[{"text","sourceIndices":[],"employer?","title?"}],' +
        '"roles":[{"employer","title","startDate?","endDate?"}],' +
        '"skills":[{"name","variants":[]}]}.',
      messages: [{ role: "user", content: JSON.stringify(evidence.map((e, i) => ({ i, text: e.text }))) }],
    });
    const block = res.content.find((b) => b.type === "text");
    return jsonFrom(block && "text" in block ? block.text : "{}") as CanonicalResult;
  }
}
