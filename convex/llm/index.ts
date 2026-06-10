"use node";
// Provider selection. Swap key/provider/model via Convex deployment env vars,
// not code: LLM_PROVIDER (gemini|anthropic), GEMINI_API_KEY/ANTHROPIC_API_KEY, LLM_MODEL.
import type { Generator, ProfileBuilder, Verifier } from "./types";
import { GeminiGenerator, GeminiProfileBuilder, GeminiVerifier } from "./gemini";
import { ClaudeGenerator, ClaudeProfileBuilder, ClaudeVerifier } from "./anthropic";
import { pickVerifierProvider } from "./verifierSelect";

const provider = () => (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();

export function getProfileBuilder(): ProfileBuilder {
  return provider() === "anthropic" ? new ClaudeProfileBuilder() : new GeminiProfileBuilder();
}
export function getGenerator(): Generator {
  return provider() === "anthropic" ? new ClaudeGenerator() : new GeminiGenerator();
}

export function getVerifier(): Verifier {
  const chosen = pickVerifierProvider(provider(), process.env);
  return chosen === "anthropic" ? new ClaudeVerifier() : new GeminiVerifier();
}

export * from "./types";
