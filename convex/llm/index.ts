"use node";
// Provider selection. Swap key/provider/model via Convex deployment env vars,
// not code: LLM_PROVIDER (gemini|anthropic), GEMINI_API_KEY/ANTHROPIC_API_KEY, LLM_MODEL.
import type { Canonicalizer, Extractor, Generator } from "./types";
import { GeminiCanonicalizer, GeminiExtractor, GeminiGenerator } from "./gemini";
import { ClaudeCanonicalizer, ClaudeExtractor, ClaudeGenerator } from "./anthropic";

const provider = () => (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

export function getExtractor(): Extractor {
  return provider() === "anthropic" ? new ClaudeExtractor() : new GeminiExtractor();
}
export function getCanonicalizer(): Canonicalizer {
  return provider() === "anthropic" ? new ClaudeCanonicalizer() : new GeminiCanonicalizer();
}
export function getGenerator(): Generator {
  return provider() === "anthropic" ? new ClaudeGenerator() : new GeminiGenerator();
}
export * from "./types";
