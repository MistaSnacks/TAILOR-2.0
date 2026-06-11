"use node";
// Provider selection. Swap key/provider/model via Convex deployment env vars,
// not code: LLM_PROVIDER (gemini|anthropic), GEMINI_API_KEY/ANTHROPIC_API_KEY, LLM_MODEL.
import type { Generator, Planner, ProfileBuilder, Reviser, Verifier } from "./types";
import { GeminiGenerator, GeminiPlanner, GeminiProfileBuilder, GeminiReviser, GeminiVerifier } from "./gemini";
import { ClaudeGenerator, ClaudePlanner, ClaudeProfileBuilder, ClaudeReviser, ClaudeVerifier } from "./anthropic";
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

// Planner uses the Verifier's vendor-independence rule: cross-vendor when a second API key is available, else the generator's vendor.
export function getPlanner(): Planner {
  const chosen = pickVerifierProvider(provider(), process.env);
  return chosen === "anthropic" ? new ClaudePlanner() : new GeminiPlanner();
}

// Reviser is a constrained re-generate — same vendor as the Generator.
export function getReviser(): Reviser {
  return provider() === "anthropic" ? new ClaudeReviser() : new GeminiReviser();
}

export * from "./types";
