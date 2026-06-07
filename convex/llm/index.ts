"use node";
// Provider selection. Swap key/provider/model via Convex deployment env vars,
// not code: LLM_PROVIDER (gemini|anthropic), GEMINI_API_KEY/ANTHROPIC_API_KEY, LLM_MODEL.
import type { Generator, ProfileBuilder } from "./types";
import { GeminiGenerator, GeminiProfileBuilder } from "./gemini";
import { ClaudeGenerator, ClaudeProfileBuilder } from "./anthropic";

const provider = () => (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

export function getProfileBuilder(): ProfileBuilder {
  return provider() === "anthropic" ? new ClaudeProfileBuilder() : new GeminiProfileBuilder();
}
export function getGenerator(): Generator {
  return provider() === "anthropic" ? new ClaudeGenerator() : new GeminiGenerator();
}
export * from "./types";
