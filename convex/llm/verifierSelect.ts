// Pure provider-selection for the independent verifier. No node/SDK imports.
export type Provider = "gemini" | "anthropic";

export function pickVerifierProvider(
  genProvider: string,
  env: Record<string, string | undefined>,
): Provider {
  const explicit = env.VERIFIER_PROVIDER?.toLowerCase();
  if (explicit === "gemini" || explicit === "anthropic") return explicit;

  const gen: Provider = genProvider === "anthropic" ? "anthropic" : "gemini";
  const want: Provider = gen === "anthropic" ? "gemini" : "anthropic";
  const keyFor = (p: Provider) => (p === "anthropic" ? env.ANTHROPIC_API_KEY : env.GEMINI_API_KEY);
  return keyFor(want) ? want : gen; // independence needs the other vendor's key
}
